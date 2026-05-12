"""HTTP server for FriendlyNode controller and static web UI."""

from __future__ import annotations

import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from friendlynode.controller.app import ControllerApp


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WEB_ROOT = PROJECT_ROOT / "web-ui"


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class ControllerHttpServer:
    def __init__(
        self,
        app: ControllerApp,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        web_root: Path = DEFAULT_WEB_ROOT,
    ) -> None:
        self.app = app
        self.host = host
        self.port = port
        self.web_root = web_root.resolve()
        handler_class = self._build_handler()
        self.httpd = ReusableThreadingHTTPServer((self.host, self.port), handler_class)

    def serve_forever(self) -> None:
        print(f"FriendlyNode controller listening on http://{self.host}:{self.port}/")
        self.httpd.serve_forever()

    def close(self) -> None:
        self.httpd.server_close()

    def _build_handler(self) -> type[BaseHTTPRequestHandler]:
        app = self.app
        web_root = self.web_root

        class FriendlyNodeRequestHandler(BaseHTTPRequestHandler):
            server_version = "FriendlyNodeHTTP/0.1"

            def do_GET(self) -> None:
                parsed = urlparse(self.path)

                if parsed.path == "/api/status":
                    self._send_json(self._build_status_response())
                    return

                if parsed.path == "/api/config":
                    self._send_json(self._build_config_response())
                    return
                if parsed.path == "/api/rns-config":
                    self._send_json(app.get_rns_config())
                    return
                if parsed.path == "/api/clients":
                    self._send_json(app.list_clients())
                    return
                self._serve_static(parsed.path)

            def do_POST(self) -> None:
                parsed = urlparse(self.path)

                if parsed.path == "/api/reticulum/restart":
                    app.restart_reticulum()
                    self._send_json(self._build_status_response())
                    return

                if parsed.path == "/api/rns-config":
                    payload = self._read_json_body()
                    self._send_json(app.save_rns_config(payload))
                    return

                if parsed.path == "/api/runtime/select":
                    payload = self._read_json_body()
                    runtime_name = payload.get("name")

                    if not isinstance(runtime_name, str) or runtime_name == "":
                        self._send_json(
                            {"error": "bad_request", "message": "Runtime name is required"},
                            HTTPStatus.BAD_REQUEST,
                        )
                        return

                    app.select_runtime(runtime_name)
                    self._send_json(self._build_status_response())
                    return

                if parsed.path == "/api/clients/draft":
                    self._send_json(app.build_client_draft())
                    return

                if parsed.path == "/api/clients":
                    payload = self._read_json_body()
                    self._send_json(app.save_client(payload))
                    return

                self._send_json(
                    {"error": "not_found", "path": parsed.path},
                    HTTPStatus.NOT_FOUND,
                )

            def do_DELETE(self) -> None:
                parsed = urlparse(self.path)

                if parsed.path.startswith("/api/clients/"):
                    client_id = unquote(parsed.path.removeprefix("/api/clients/"))
                    self._send_json(app.remove_client(client_id))
                    return

                self._send_json(
                    {"error": "not_found", "path": parsed.path},
                    HTTPStatus.NOT_FOUND,
                )

            def log_message(self, fmt: str, *args: Any) -> None:
                print(f"[http] {self.address_string()} - {fmt % args}")

            def _build_status_response(self) -> dict[str, object]:
                runtimes = app.runtime_manager.list_runtimes()
                active_runtime_name = app.config.engine_name

                return {
                    "controller": {
                        "running": True,
                        "web_root": str(web_root),
                    },
                    "engine": app.engine_supervisor.status(),
                    "runtime": {
                        "active": active_runtime_name,
                        "available": [runtime.to_dict() for runtime in runtimes],
                    },
                    "clients": app.list_clients(),
                    "logs": app.state.snapshot_logs(),
                }

            def _build_config_response(self) -> dict[str, object]:
                return app.config.to_dict()

            def _build_runtimes_response(self) -> dict[str, object]:
                runtimes = app.runtime_manager.list_runtimes()

                return {
                    "active": app.config.engine_name,
                    "available": [runtime.to_dict() for runtime in runtimes],
                }

            def _serve_static(self, request_path: str) -> None:
                if request_path in ("", "/"):
                    relative_path = "index.html"
                else:
                    relative_path = unquote(request_path).lstrip("/")

                file_path = (web_root / relative_path).resolve()

                if not self._is_inside_web_root(file_path):
                    self._send_json(
                        {"error": "forbidden", "path": request_path},
                        HTTPStatus.FORBIDDEN,
                    )
                    return

                if file_path.is_dir():
                    file_path = file_path / "index.html"

                if not file_path.exists() or not file_path.is_file():
                    self._send_json(
                        {"error": "not_found", "path": request_path},
                        HTTPStatus.NOT_FOUND,
                    )
                    return

                content_type = mimetypes.guess_type(file_path.name)[0]
                if content_type is None:
                    content_type = "application/octet-stream"

                data = file_path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _is_inside_web_root(self, file_path: Path) -> bool:
                try:
                    file_path.relative_to(web_root)
                except ValueError:
                    return False
                return True

            def _read_json_body(self) -> dict[str, object]:
                content_length = int(self.headers.get("Content-Length", "0"))

                if content_length <= 0:
                    return {}

                raw_body = self.rfile.read(content_length)

                if raw_body == b"":
                    return {}

                payload = json.loads(raw_body.decode("utf-8"))

                if not isinstance(payload, dict):
                    raise ValueError("JSON body must be an object")

                return payload

            def _send_json(
                self,
                payload: dict[str, object],
                status: HTTPStatus = HTTPStatus.OK,
            ) -> None:
                data = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        return FriendlyNodeRequestHandler
