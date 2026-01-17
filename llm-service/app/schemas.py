from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union

class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    stream: bool = False
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    # Add other OpenAI-compatible fields as needed

class ModelAdapterConfig(BaseModel):
    id: str
    name: str
    type: str = "custom" # "openai", "anthropic", "custom"
    script_content: Optional[str] = None # The python code
    config: Dict[str, Any] = {} # API keys, endpoints, etc.

class ModelListResponse(BaseModel):
    data: List[ModelAdapterConfig]
