from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import (
    ChatCompletionRequest,
    ModelAdapterConfig,
    ModelListResponse,
    EmbeddingRequest,
    EmbeddingResponse,
)
from app.services.adapter_manager import manager
import json
import time

router = APIRouter()


@router.get("/models", response_model=ModelListResponse)
async def list_models():
    models = manager.list_models()
    return ModelListResponse(data=models)


@router.post("/embeddings", response_model=EmbeddingResponse)
async def embeddings(request: EmbeddingRequest):
    try:
        result = await manager.get_embeddings(request.model, request.input)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models")
async def register_model(model: ModelAdapterConfig):
    manager.save_model(model)
    return {"status": "success", "model_id": model.id}


@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    success = manager.delete_model(model_id)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"status": "success", "model_id": model_id}


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    try:
        if request.stream:
            return StreamingResponse(
                stream_generator(request), media_type="text/event-stream"
            )
        else:
            content = ""
            async for item in manager.generate(request):
                if isinstance(item, str):
                    content += item

            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.model,
                "choices": [
                    {
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
            }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def stream_generator(request: ChatCompletionRequest):
    print(f">>> [API] Incoming stream request for model: {request.model}", flush=True)
    try:
        async for chunk in manager.generate(request):
            if isinstance(chunk, dict) and "trace" in chunk:
                data = {
                    "id": f"trace-{int(time.time())}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": request.model,
                    "choices": [],
                    "trace": chunk["trace"],
                }
                yield f"data: {json.dumps(data)}\n\n"
            elif isinstance(chunk, str):
                data = {
                    "id": f"chatcmpl-{int(time.time())}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": request.model,
                    "choices": [{"delta": {"content": chunk}, "finish_reason": None}],
                }
                yield f"data: {json.dumps(data)}\n\n"

    except Exception as e:
        import traceback

        err_msg = f"INTERNAL_ERROR: {str(e)}\n{traceback.format_exc()}"
        print(f">>> [API] Stream Error: {err_msg}", flush=True)
        # 即使报错，也通过 data 流发送，确保前端诊断终端能显示 Raw 日志
        yield f"data: {json.dumps({'error': str(e), 'choices': [{'delta': {'content': f'\\n[系统错误] {str(e)}'}}]})}\n\n"
        yield f"DEBUG_RAW: {err_msg}\n\n"
