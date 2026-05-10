"""Small API DTOs."""

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ApiResponse:
    ok: bool
    data: dict[str, Any]
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "data": self.data, "error": self.error}
