import os
import importlib.util
import json
import inspect
import time
from typing import List, Dict, Any, Union
from app.schemas import ModelAdapterConfig, ChatCompletionRequest
import httpx


class AdapterManager:
    def __init__(self):
        self.data_dir = "data"
        self.models_file = os.path.join(self.data_dir, "models.json")
        self.scripts_dir = os.path.join(self.data_dir, "scripts")
        os.makedirs(self.scripts_dir, exist_ok=True)
        self._models: Dict[str, ModelAdapterConfig] = self._load_models()

    def _load_models(self) -> Dict[str, ModelAdapterConfig]:
        if not os.path.exists(self.models_file):
            return {}
        try:
            with open(self.models_file, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return {m["id"]: ModelAdapterConfig(**m) for m in data}
                return {
                    model_id: ModelAdapterConfig(**model_config)
                    for model_id, model_config in data.items()
                }
        except Exception:
            return {}

    def list_models(self) -> List[ModelAdapterConfig]:
        return list(self._models.values())

    def save_model(self, model: ModelAdapterConfig):
        self._models[model.id] = model
        with open(self.models_file, "w") as f:
            json.dump(
                {model_id: m.dict() for model_id, m in self._models.items()},
                f,
                indent=2,
            )

    def delete_model(self, model_id: str) -> bool:
        if model_id in self._models:
            # Try to delete the script file if it exists
            script_path = os.path.join(self.scripts_dir, f"{model_id}.py")
            if os.path.exists(script_path):
                try:
                    os.remove(script_path)
                except OSError:
                    pass

            del self._models[model_id]
            with open(self.models_file, "w") as f:
                json.dump(
                    {mid: m.dict() for mid, m in self._models.items()}, f, indent=2
                )
            return True
        return False

    async def generate(self, request: ChatCompletionRequest):
        model_id = request.model
        model_cfg = self._models.get(model_id)
        if not model_cfg:
            raise ValueError(f"Model {model_id} not found")

        yield {
            "trace": {
                "source": "Gateway",
                "target": "Remote Provider",
                "action": "发送模型请求",
                "data": {
                    "model_id": model_id,
                    "type": model_cfg.type,
                    "endpoint": f"adapter://{model_cfg.type}",
                },
            }
        }

        start_time = time.perf_counter()

        if model_cfg.type == "custom" and model_cfg.script_content:
            try:
                script_path = os.path.join(self.scripts_dir, f"{model_id}.py")
                with open(script_path, "w") as f:
                    f.write(model_cfg.script_content)

                spec = importlib.util.spec_from_file_location(
                    f"adapter_{model_id}", script_path
                )
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                script_config = model_cfg.config if model_cfg.config is not None else {}

                if hasattr(module, "generate_stream"):
                    func = module.generate_stream
                    if inspect.isasyncgenfunction(func):
                        async for chunk in func(request.messages, script_config):
                            yield chunk
                    elif inspect.isgeneratorfunction(func):
                        for chunk in func(request.messages, script_config):
                            yield chunk
                    else:
                        res = func(request.messages, script_config)
                        if inspect.isasyncgen(res):
                            async for chunk in res:
                                yield chunk
                        elif inspect.isgenerator(res):
                            for chunk in res:
                                yield chunk
                        else:
                            yield str(res)
                else:
                    if request.is_diagnostic:
                        yield "错误: 脚本中未找到 'generate_stream' 函数。\n"
            except Exception as e:
                import traceback

                if request.is_diagnostic:
                    yield f"执行错误:\n{traceback.format_exc()}\n"
                else:
                    yield f"错误: {str(e)}"
        else:
            first_chunk = True
            async for chunk in self._builtin_adapter(model_cfg, request):
                yield chunk

                if first_chunk:
                    duration = (time.perf_counter() - start_time) * 1000
                    # 2. 模型处理 Trace (LLM -> LLM) - 仅发送一次代表开始推理
                    yield {
                        "trace": {
                            "source": "Remote Provider",
                            "target": "Remote Provider",
                            "action": "模型推理中",
                            "data": {"start_duration_ms": round(duration, 2)},
                        }
                    }
                    # 3. 响应返回 Trace (LLM -> Agent) - 仅发送一次代表首字节返回
                    yield {
                        "trace": {
                            "source": "Remote Provider",
                            "target": "Agent",
                            "action": "接收模型响应",
                            "data": {"status": "streaming"},
                        }
                    }
                    first_chunk = False

            # 流结束，发送一个完成 Trace
            final_duration = (time.perf_counter() - start_time) * 1000
            yield {
                "trace": {
                    "source": "Remote Provider",
                    "target": "Agent",
                    "action": "响应接收完成",
                    "data": {"total_duration_ms": round(final_duration, 2)},
                }
            }

    async def _builtin_adapter(
        self, model_cfg: ModelAdapterConfig, request: ChatCompletionRequest
    ):
        cfg = model_cfg.config
        api_key = cfg.get("api_key", "")
        base_url = cfg.get("base_url", "").rstrip("/")
        model_name = cfg.get("model", model_cfg.id)
        full_endpoint = f"{base_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model_name,
            "messages": [m.dict() for m in request.messages],
            "stream": True,
        }

        # Set explicit timeouts: 10s for connection, 60s for read/write/pool
        timeout = httpx.Timeout(60.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream(
                    "POST", full_endpoint, json=payload, headers=headers
                ) as resp:
                    if resp.status_code != 200:
                        err_body = await resp.aread()
                        yield f"错误: {resp.status_code} - {err_body.decode()}"
                        return

                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                chunk = data["choices"][0]["delta"].get("content", "")
                                if chunk:
                                    yield chunk
                            except Exception:
                                continue
            except Exception as e:
                yield f"连接错误: [{type(e).__name__}] {str(e)}"

    async def get_embeddings(
        self, model_id: str, input_text: Union[str, List[str]]
    ) -> Dict[str, Any]:
        model_cfg = self._models.get(model_id)
        if not model_cfg:
            raise ValueError(f"Model {model_id} not found")

        cfg = model_cfg.config
        api_key = cfg.get("api_key", "")
        base_url = cfg.get("base_url", "").rstrip("/")
        model_name = cfg.get("model", model_cfg.id)
        full_endpoint = f"{base_url}/embeddings"

        print(
            f">>> [Embedding] Requesting: {full_endpoint} (Model: {model_name})",
            flush=True,
        )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": model_name, "input": input_text}

        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(full_endpoint, json=payload, headers=headers)
            if resp.status_code != 200:
                raise Exception(f"Embedding error: {resp.status_code} - {resp.text}")
            return resp.json()


manager = AdapterManager()
