"""HTTP server for FriendlyNode controller and static web UI."""

from __future__ import annotations

import json
import mimetypes
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

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
        self.restart_requested = False
        handler_class = self._build_handler()
        self.listen_hosts = self._build_listen_hosts(self.host)
        self.httpds = [
            ReusableThreadingHTTPServer((listen_host, self.port), handler_class)
            for listen_host in self.listen_hosts
        ]

    def serve_forever(self) -> None:
        threads = []

        for listen_host, httpd in zip(self.listen_hosts, self.httpds, strict=True):
            print(f"FriendlyNode controller listening on http://{listen_host}:{self.port}/")
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            threads.append(thread)

        while any(thread.is_alive() for thread in threads):
            for thread in threads:
                thread.join(0.5)

    def close(self) -> None:
        for httpd in self.httpds:
            httpd.server_close()

    def request_restart(self) -> None:
        self.restart_requested = True
        thread = threading.Thread(target=self._shutdown_after_response, daemon=True)
        thread.start()

    def _shutdown_after_response(self) -> None:
        time.sleep(0.2)
        for httpd in self.httpds:
            httpd.shutdown()

    def _build_listen_hosts(self, configured_host: str) -> list[str]:
        host = configured_host.strip()

        if host in ("", "127.0.0.1", "localhost"):
            return ["127.0.0.1"]

        if host == "0.0.0.0":
            return ["0.0.0.0"]

        return ["127.0.0.1", host]

    def _build_handler(self) -> type[BaseHTTPRequestHandler]:
        app = self.app
        web_root = self.web_root
        server_port = self.port
        controller_server = self

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
                if parsed.path == "/api/access/ssh/status":
                    self._send_json(app.get_access_status()["ssh"])
                    return
                if parsed.path == "/api/access/security":
                    self._send_json(self._build_security_response())
                    return
                if parsed.path == "/api/runtime/releases":
                    self._send_json(app.get_runtime_overview())
                    return
                if parsed.path == "/api/rns-config":
                    self._send_json(app.get_rns_config())
                    return
                if parsed.path == "/api/announces":
                    self._send_json(app.list_announces())
                    return
                if parsed.path == "/api/nomadnet/nodes":
                    self._send_json(app.list_nomadnet_nodes())
                    return
                if parsed.path == "/api/nomadnet/pages":
                    self._send_json(app.list_nomadnet_pages())
                    return
                if parsed.path == "/api/nomadnet/local-page":
                    params = parse_qs(parsed.query)
                    path = params.get("path", ["index.mu"])[0]
                    self._send_json(app.load_nomadnet_local_page(path))
                    return
                if parsed.path == "/api/nomadnet/page":
                    params = parse_qs(parsed.query)
                    destination_hash = params.get("destination_hash", [""])[0]
                    path = params.get("path", ["/page/index.mu"])[0]
                    self._send_json(app.fetch_nomadnet_page(destination_hash, path))
                    return
                if parsed.path == "/api/clients":
                    self._send_json(app.list_clients())
                    return
                client_route = self._parse_client_route(parsed.path)
                if client_route is not None:
                    client_id, action, contact_id = client_route

                    if action == "conversations":
                        self._send_json(app.list_client_conversations(client_id))
                        return

                    if action == "messages" and contact_id is not None:
                        self._send_json(app.list_client_messages(client_id, contact_id))
                        return

                    if action == "export" and contact_id is not None:
                        self._send_json(app.export_client_contact(client_id, contact_id))
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

                if parsed.path == "/api/config":
                    payload = self._read_json_body()
                    self._send_json(app.save_app_config(payload))
                    return

                if parsed.path == "/api/controller/restart":
                    payload = self._read_json_body()

                    if payload:
                        app.save_app_config(payload)

                    self._send_json(
                        {
                            "status": "restarting",
                            "config": app.config.to_dict(),
                        }
                    )
                    controller_server.request_restart()
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

                if parsed.path == "/api/runtime/install":
                    payload = self._read_json_body()
                    version = payload.get("version")

                    if not isinstance(version, str) or version == "":
                        self._send_json(
                            {"error": "bad_request", "message": "Reticulum version is required"},
                            HTTPStatus.BAD_REQUEST,
                        )
                        return

                    app.install_reticulum_release(version)
                    self._send_json(self._build_status_response())
                    return

                if parsed.path == "/api/runtime/feature":
                    payload = self._read_json_body()
                    runtime_name = payload.get("runtime")
                    feature_name = payload.get("feature")
                    enabled = payload.get("enabled")

                    if not isinstance(runtime_name, str) or runtime_name == "":
                        self._send_json(
                            {"error": "bad_request", "message": "Runtime name is required"},
                            HTTPStatus.BAD_REQUEST,
                        )
                        return

                    if not isinstance(feature_name, str) or feature_name == "":
                        self._send_json(
                            {"error": "bad_request", "message": "Runtime feature is required"},
                            HTTPStatus.BAD_REQUEST,
                        )
                        return

                    app.set_runtime_feature(runtime_name, feature_name, bool(enabled))
                    self._send_json(self._build_status_response())
                    return

                if parsed.path == "/api/nomadnet/local-page":
                    payload = self._read_json_body()
                    self._send_json(app.save_nomadnet_local_page(payload))
                    return

                if parsed.path == "/api/clients/draft":
                    self._send_json(app.build_client_draft())
                    return

                if parsed.path == "/api/clients":
                    payload = self._read_json_body()
                    self._send_json(app.save_client(payload))
                    return

                client_route = self._parse_client_route(parsed.path)
                if client_route is not None:
                    client_id, action, contact_id = client_route

                    if action == "contacts":
                        payload = self._read_json_body()
                        self._send_json(app.save_client_contact(client_id, payload))
                        return

                    if action == "messages" and contact_id is not None:
                        payload = self._read_json_body()
                        self._send_json(app.send_client_message(client_id, contact_id, payload))
                        return

                self._send_json(
                    {"error": "not_found", "path": parsed.path},
                    HTTPStatus.NOT_FOUND,
                )

            def do_DELETE(self) -> None:
                parsed = urlparse(self.path)
                client_route = self._parse_client_route(parsed.path)

                if client_route is not None:
                    client_id, action, contact_id = client_route

                    if action == "messages" and contact_id is not None:
                        self._send_json(app.clear_client_messages(client_id, contact_id))
                        return

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
                return {
                    "controller": {
                        "running": True,
                        "web_root": str(web_root),
                        "http_host": controller_server.listen_hosts[0],
                        "http_hosts": list(controller_server.listen_hosts),
                        "http_port": server_port,
                        "listen_url": (
                            f"http://{controller_server.listen_hosts[0]}:{server_port}/"
                        ),
                        "listen_urls": [
                            f"http://{host}:{server_port}/"
                            for host in controller_server.listen_hosts
                        ],
                    },
                    "engine": app.engine_supervisor.status(),
                    "runtime": app.get_runtime_overview(),
                    "access": app.get_access_status(
                        request_is_https=self._request_is_https(),
                        forwarded_proto=self._trusted_forwarded_proto(),
                    ),
                    "config": app.config.to_dict(),
                    "clients": app.list_clients(),
                    "announces": app.state.snapshot_announces(),
                    "logs": app.state.snapshot_logs(),
                }

            def _build_config_response(self) -> dict[str, object]:
                return app.config.to_dict()

            def _build_security_response(self) -> dict[str, object]:
                return app.get_channel_security_status(
                    request_is_https=self._request_is_https(),
                    forwarded_proto=self._trusted_forwarded_proto(),
                )

            def _request_is_https(self) -> bool:
                cipher = getattr(self.request, "cipher", None)

                if not callable(cipher):
                    return False

                try:
                    return cipher() is not None
                except OSError:
                    return False

            def _trusted_forwarded_proto(self) -> str:
                if not self._request_from_loopback():
                    return ""

                for header_name in (
                    "X-Forwarded-Proto",
                    "X-Forwarded-Scheme",
                    "X-Url-Scheme",
                ):
                    value = self.headers.get(header_name, "")

                    if value != "":
                        return value.split(",", 1)[0].strip().lower()

                forwarded = self.headers.get("Forwarded", "")

                for forwarded_item in forwarded.split(","):
                    for pair in forwarded_item.split(";"):
                        key, separator, value = pair.strip().partition("=")

                        if separator != "" and key.strip().lower() == "proto":
                            return value.strip().strip('"').lower()

                return ""

            def _request_from_loopback(self) -> bool:
                try:
                    host = self.client_address[0]
                    return host == "localhost" or host.startswith("127.") or host == "::1"
                except (IndexError, TypeError):
                    return False

            def _build_runtimes_response(self) -> dict[str, object]:
                return app.get_runtime_overview()

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

            def _parse_client_route(self, path: str) -> tuple[str, str, str | None] | None:
                parts = [unquote(part) for part in path.strip("/").split("/")]

                if len(parts) == 4 and parts[0:2] == ["api", "clients"]:
                    client_id = parts[2]

                    if parts[3] == "conversations":
                        return client_id, "conversations", None

                    if parts[3] == "contacts":
                        return client_id, "contacts", None

                if len(parts) == 6 and parts[0:2] == ["api", "clients"]:
                    client_id = parts[2]
                    contact_id = parts[4]

                    if parts[3] == "contacts" and parts[5] == "export":
                        return client_id, "export", contact_id

                    if parts[3] == "conversations" and parts[5] == "messages":
                        return client_id, "messages", contact_id

                return None

        return FriendlyNodeRequestHandler
