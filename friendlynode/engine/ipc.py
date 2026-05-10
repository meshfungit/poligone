"""Stub IPC boundary between controller and engine."""

from collections.abc import Callable

from friendlynode.engine.events import EngineEvent

EventSink = Callable[[EngineEvent], None]


class IpcBus:
    def __init__(self) -> None:
        self._subscribers: list[EventSink] = []

    def subscribe(self, sink: EventSink) -> None:
        self._subscribers.append(sink)

    def publish(self, event: EngineEvent) -> None:
        for sink in list(self._subscribers):
            sink(event)
