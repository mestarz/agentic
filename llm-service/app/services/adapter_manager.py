import importlib.util
import inspect
import json
import os
import time
from typing import Any, Dict, List, Union

import httpx
from app.schemas import ChatCompletionRequest, ModelAdapterConfig


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

        # 1. 发送 (Agent -> LLM)
        yield {
            "trace": {
                "source": "Agent",
                "target": "Remote Provider",
                "action": "发送模型请求",
                "data": {"model": model_id},
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

                first_chunk = True
                if hasattr(module, "generate_stream"):
                    func = module.generate_stream

                    async def process_gen(gen):
                        nonlocal first_chunk
                        if inspect.isasyncgen(gen):
                            async for chunk in gen:
                                yield chunk
                                if first_chunk:
                                    # 2. 推理 (LLM -> LLM)
                                    yield {
                                        "trace": {
                                            "source": "Remote Provider",
                                            "target": "Remote Provider",
                                            "action": "模型推理中",
                                        }
                                    }
                                    first_chunk = False
                        else:
                            for chunk in gen:
                                yield chunk
                                if first_chunk:
                                    # 2. 推理 (LLM -> LLM)
                                    yield {
                                        "trace": {
                                            "source": "Remote Provider",
                                            "target": "Remote Provider",
                                            "action": "模型推理中",
                                        }
                                    }
                                    first_chunk = False

                    res = func(request.messages, script_config)
                    async for item in process_gen(res):
                        yield item
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
                    # 2. 推理 (LLM -> LLM)
                    yield {
                        "trace": {
                            "source": "Remote Provider",
                            "target": "Remote Provider",
                            "action": "模型推理中",
                        }
                    }
                    first_chunk = False

            # 3. 返回 (LLM -> Agent)
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

                if hasattr(module, "get_embeddings"):
                    func = module.get_embeddings
                    if inspect.iscoroutinefunction(func):
                        res = await func(input_text, script_config)
                    else:
                        res = func(input_text, script_config)

                    # Ensure standard response fields
                    if isinstance(res, dict):
                        if "error" in res:
                            raise Exception(f"Custom script error: {res['error']}")
                        if "model" not in res:
                            res["model"] = model_id
                        if "usage" not in res:
                            res["usage"] = {"prompt_tokens": 0, "total_tokens": 0}
                        if "object" not in res:
                            res["object"] = "list"
                    return res
                else:
                    raise ValueError(
                        f"Script for {model_id} does not have 'get_embeddings' function"
                    )
            except Exception as e:
                import traceback

                print(traceback.format_exc())
                raise Exception(f"Error executing custom embedding script: {str(e)}")
        else:
            return await self._builtin_embedding_adapter(model_cfg, input_text)

    async def _builtin_embedding_adapter(
        self, model_cfg: ModelAdapterConfig, input_text: Union[str, List[str]]
    ):
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
