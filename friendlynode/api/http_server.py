"""Tiny standard-library static HTTP server for the web UI."""

from __future__ import annotations

import functools
import http.server
import socketserver
import threading
from pathlib import Path

from friendlynode.config.defaults import DEFAULT_CONTROLLER_HOST, DEFAULT_CONTROLLER_PORT, WEB_UI_DIR


class StaticUiServer:
    def __init__(
        self,
        host: str = DEFAULT_CONTROLLER_HOST,
        port: int = DEFAULT_CONTROLLER_PORT,
        web_root: Path = WEB_UI_DIR,
    ) -> None:
        self.host = host
        self.port = port
        self.web_root = web_root
        self._httpd: socketserver.TCPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(self.web_root))
        self._httpd = socketserver.TCPServer((self.host, self.port), handler)
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
