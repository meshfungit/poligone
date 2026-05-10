"""Engine event DTOs."""

from dataclasses import dataclass, field
from time import time
from typing import Any


@dataclass(slots=True)
class EngineEvent:
    topic: str
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time)
