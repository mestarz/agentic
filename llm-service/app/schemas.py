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


class SanitizeRequest(BaseModel):
    model: str
    messages: List[Message]


class Fact(BaseModel):
    content: str
    topic: Optional[str] = "general"
    confidence: float = 1.0


class SanitizeResponse(BaseModel):
    facts: List[Fact]


class ReflectRequest(BaseModel):
    model: str
    new_facts: List[Fact]
    related_memories: List[Dict[str, Any]]


class EvolutionInstruction(BaseModel):
    action: str  # "create", "evolve", "deprecate", "ignore"
    fact_content: str
    memory_id: Optional[str] = None
    reason: Optional[str] = None


class ReflectResponse(BaseModel):
    instructions: List[EvolutionInstruction]
