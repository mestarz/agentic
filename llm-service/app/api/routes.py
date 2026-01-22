from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import (
    ChatCompletionRequest,
    ModelAdapterConfig,
    ModelListResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    SanitizeRequest,
    SanitizeResponse,
    ReflectRequest,
    ReflectResponse,
    Message as SchemaMessage,
)
from app.services.adapter_manager import manager
import json
import time

router = APIRouter()


@router.post("/memory/sanitize", response_model=SanitizeResponse)
async def sanitize_memory(request: SanitizeRequest):
    print(f">>> [Memory] Sanitizing dialogue for model: {request.model}", flush=True)
    system_prompt = """你是一个记忆清洗专家。你的任务是从对话历史中提取核心事实、偏好和技术决策。
要求：
1. 去除所有寒暄、礼貌用语和无效信息。
2. 将对话切分为独立的、原子化的事实碎片。
3. 如果涉及到用户偏好或技术选型，请务必提取。
4. 返回 JSON 格式，包含 facts 列表，每个 fact 包含 content (事实内容) 和 topic (主题)。
格式示例：
{
  "facts": [
    {"content": "用户喜欢使用 Python 进行后端开发", "topic": "preference"},
    {"content": "项目名称被定为 'agentic'", "topic": "project_info"}
  ]
}
"""
    try:
        # 构造标准的聊天请求
        chat_req = ChatCompletionRequest(
            model=request.model,
            messages=[
                SchemaMessage(role="system", content=system_prompt),
                SchemaMessage(
                    role="user",
                    content=f"请清洗以下对话并提取事实：\n{json.dumps([m.dict() for m in request.messages], ensure_ascii=False)}",
                ),
            ],
            stream=False,
        )

        content = ""
        async for item in manager.generate(chat_req):
            if isinstance(item, str):
                content += item

        # 解析 LLM 返回的 JSON
        # 注意：某些模型可能返回带 Markdown 代码块的内容，需要处理
        clean_content = content.strip()
        if "```json" in clean_content:
            clean_content = clean_content.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_content:
            clean_content = clean_content.split("```")[1].split("```")[0].strip()

        print(f">>> [Memory] LLM returned: {clean_content}", flush=True)
        data = json.loads(clean_content)
        return SanitizeResponse(**data)

    except Exception as e:
        print(f"Sanitize error: {e}")
        raise HTTPException(status_code=500, detail=f"Sanitization failed: {str(e)}")


@router.post("/memory/reflect", response_model=ReflectResponse)
async def reflect_memory(request: ReflectRequest):
    print(f">>> [Memory] Reflecting on {len(request.new_facts)} new facts", flush=True)
    system_prompt = """你是一个记忆反思专家。你的任务是比较新提取的事实与已有的长期记忆，决定如何演进记忆库。
规则：
1. Action: 'create' - 如果事实是全新的，且与已有记忆无关。
2. Action: 'evolve' - 如果新事实补充、修正或更新了已有记忆（请在 reason 中说明）。
3. Action: 'deprecate' - 如果新事实证明已有记忆已过时或错误。
4. Action: 'ignore' - 如果新事实是重复的或无价值的。

返回 JSON 格式，包含 instructions 列表。
"""
    try:
        user_content = {
            "new_facts": [f.dict() for f in request.new_facts],
            "existing_memories": request.related_memories,
        }

        chat_req = ChatCompletionRequest(
            model=request.model,
            messages=[
                SchemaMessage(role="system", content=system_prompt),
                SchemaMessage(
                    role="user",
                    content=f"请分析以下新事实与已有记忆的关系：\n{json.dumps(user_content, ensure_ascii=False)}",
                ),
            ],
            stream=False,
        )

        content = ""
        async for item in manager.generate(chat_req):
            if isinstance(item, str):
                content += item

        clean_content = content.strip()
        if "```json" in clean_content:
            clean_content = clean_content.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_content:
            clean_content = clean_content.split("```")[1].split("```")[0].strip()

        print(f">>> [Memory] Reflection result: {clean_content}", flush=True)
        data = json.loads(clean_content)
        return ReflectResponse(**data)

    except Exception as e:
        print(f"Reflect error: {e}")
        raise HTTPException(status_code=500, detail=f"Reflection failed: {str(e)}")


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
