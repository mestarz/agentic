from pydantic import BaseModel
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
    is_diagnostic: bool = False  # [NEW] flag for diagnostic tests


class ModelAdapterConfig(BaseModel):
    id: str
    name: str
    purpose: str = "chat"  # "chat" or "embedding"
    type: str = "custom"  # "openai", "anthropic", "custom"
    script_content: Optional[str] = None  # The python code
    config: Dict[str, Any] = {}  # API keys, endpoints, etc.


class ModelListResponse(BaseModel):
    data: List[ModelAdapterConfig]


class EmbeddingRequest(BaseModel):
    model: str
    input: Union[str, List[str]]


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[Dict[str, Any]]
    model: str
    usage: Dict[str, int]
