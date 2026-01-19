import json
import httpx
import os
import inspect

async def generate_stream(messages, config):
    """
    Standard Custom Adapter for OpenAI-compatible APIs (e.g., Deepseek, Local LLMs).
    
    This script connects to a remote API endpoint and streams the response back.
    The 'config' dictionary is populated from models.json.
    """
    
    # 1. Configuration (from models.json)
    api_key = config.get("api_key")
    # Default to a common endpoint, but prefer config
    base_url = config.get("base_url", "https://api.deepseek.com") 
    model_name = config.get("model", "deepseek-chat")
    
    if not api_key:
        yield "Error: API Key not found in model configuration (config.api_key)."
        return

    # 2. Prepare Messages
    # 'messages' is a list of Pydantic objects. We convert them to dicts.
    msgs_payload = [{"role": m.role, "content": m.content} for m in messages]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": msgs_payload,
        "stream": True,
        "temperature": config.get("temperature", 1.0),
        "max_tokens": config.get("max_tokens", 4096)
    }
    
    # 3. Request & Stream
    timeout = httpx.Timeout(60.0, connect=10.0)
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Note: Ensure the URL path (/chat/completions) is correct for your provider
            url = f"{base_url.rstrip('/')}/chat/completions"
            
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"API Error {response.status_code}: {err_body.decode()}"
                    return

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            # Deepseek / OpenAI structure: choices[0].delta.content
                            delta = data["choices"][0]["delta"]
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except Exception:
                            # Skip malformed chunks or keep-alive signals
                            continue
                            
    except Exception as e:
        yield f"Connection Exception: {str(e)}"