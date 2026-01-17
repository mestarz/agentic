import os
import importlib.util
import json
import asyncio
import time
from typing import List, Optional, Dict, Any
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
                return {model_id: ModelAdapterConfig(**model_config) for model_id, model_config in data.items()}
        except Exception as e:
            return {}

    def list_models(self) -> List[ModelAdapterConfig]:
        return list(self._models.values())

    def save_model(self, model: ModelAdapterConfig):
        self._models[model.id] = model
        with open(self.models_file, "w") as f:
            json.dump({model_id: m.dict() for model_id, m in self._models.items()}, f, indent=2)

    async def generate(self, request: ChatCompletionRequest):
        model_id = request.model
        model_cfg = self._models.get(model_id)
        if not model_cfg:
            raise ValueError(f"Model {model_id} not found")

        # Trace: Gateway start
        yield {"trace": {"source": "Gateway", "target": "Adapter", "action": f"Dispatch: {model_cfg.type}"}}

        start_time = time.perf_counter()
        
        # 1. 如果是自定义脚本类型
        if model_cfg.type == "custom" and model_cfg.script_content:
            script_path = os.path.join(self.scripts_dir, f"{model_id}.py")
            with open(script_path, "w") as f:
                f.write(model_cfg.script_content)

            spec = importlib.util.spec_from_file_location(f"adapter_{model_id}", script_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            yield {"trace": {"source": "Adapter", "target": "Adapter", "action": "Executing Custom Script"}}

            if asyncio.iscoroutinefunction(module.generate_stream):
                async for chunk in module.generate_stream(request.messages, model_cfg.config):
                    yield chunk
            else:
                for chunk in module.generate_stream(request.messages, model_cfg.config):
                    yield chunk
        
        # 2. 如果是标准厂商类型 (openai, gemini, deepseek 等)
        else:
            async for chunk in self._builtin_adapter(model_cfg, request):
                yield chunk

        duration = (time.perf_counter() - start_time) * 1000
        yield {"trace": {"source": "Adapter", "target": "Gateway", "action": "Stream Complete", "data": {"duration_ms": round(duration, 2)}}}

    async def _builtin_adapter(self, model_cfg: ModelAdapterConfig, request: ChatCompletionRequest):
        cfg = model_cfg.config
        api_key = cfg.get("api_key", "")
        base_url = cfg.get("base_url", "").rstrip("/")
        model_name = cfg.get("model", model_cfg.id)

        yield {"trace": {"source": "Adapter", "target": "Remote Provider", "action": f"Call {model_cfg.type} API", "data": {"model": model_name}}}

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model_name,
            "messages": [m.dict() for m in request.messages],
            "stream": True
        }

        first_token = True
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as resp:
                    if resp.status_code != 200:
                        err_body = await resp.aread()
                        yield f"Error: {resp.status_code} - {err_body.decode()}"
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
                                    if first_token:
                                        yield {"trace": {"source": "Remote Provider", "target": "Adapter", "action": "First Chunk Received"}}
                                        first_token = False
                                    yield chunk
                            except:
                                continue
            except Exception as e:
                yield f"Connection Error: {str(e)}"

manager = AdapterManager()
