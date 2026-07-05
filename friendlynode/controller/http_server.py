"""HTTP server for FriendlyNode controller and static web UI."""

from __future__ import annotations

import socket
import errno
import json
import mimetypes
import os
import sys
import threading
import time
import csv
import io
import subprocess
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
CLIENT_DISCONNECT_WINERRORS = frozenset({10053, 10054})

CLIENT_DISCONNECT_ERRNOS = frozenset(
    value
    for value in (
        getattr(errno, "ECONNABORTED", None),
        getattr(errno, "ECONNRESET", None),
        getattr(errno, "EPIPE", None),
    )
    if value is not None
)

class ControllerPortBindError(OSError):
    """Raised when FriendlyNode cannot bind the controller HTTP port."""

def is_client_disconnect_error(exc: BaseException) -> bool:
    if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
        return True

    if not isinstance(exc, OSError):
        return False

    winerror = getattr(exc, "winerror", None)
    if winerror in CLIENT_DISCONNECT_WINERRORS:
        return True

    error_number = getattr(exc, "errno", None)
    return error_number in CLIENT_DISCONNECT_ERRNOS

def describe_port_listeners(port: int) -> list[str]:
    listeners = collect_port_listeners(port)
    result: list[str] = []

    for listener in listeners:
        local_address = listener.get("local_address", "")
        pid = listener.get("pid", "")
        process_name = listener.get("process_name", "")

        if process_name != "":
            result.append(f"{local_address} pid={pid} process={process_name}")
        else:
            result.append(f"{local_address} pid={pid}")

    return result


def stop_listener_commands(pids: list[str]) -> list[str]:
    if len(pids) == 0:
        return []

    if sys.platform == "win32":
        return [f"Stop-Process -Id {pid} -Force" for pid in pids]

    return [f"kill {pid}" for pid in pids]

def collect_port_listeners(port: int) -> list[dict[str, str]]:
    if sys.platform == "win32":
        return collect_windows_port_listeners(port)

    return collect_unix_port_listeners(port)


def collect_windows_port_listeners(port: int) -> list[dict[str, str]]:
    try:
        completed = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    listeners: list[dict[str, str]] = []

    for line in completed.stdout.splitlines():
        parts = line.split()

        if len(parts) < 5:
            continue

        protocol = parts[0].upper()

        if protocol != "TCP":
            continue

        local_address = parts[1]
        state = parts[3].upper()
        pid = parts[4]

        if state != "LISTENING":
            continue

        if not local_address.endswith(f":{port}"):
            continue

        listeners.append(
            {
                "local_address": local_address,
                "pid": pid,
                "process_name": windows_process_name(pid),
            }
        )

    return listeners

def collect_unix_port_listeners(port: int) -> list[dict[str, str]]:
    listeners = collect_unix_port_listeners_with_ss(port)

    if len(listeners) > 0:
        return listeners

    return collect_unix_port_listeners_with_lsof(port)


def collect_unix_port_listeners_with_ss(port: int) -> list[dict[str, str]]:
    try:
        completed = subprocess.run(
            ["ss", "-ltnp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    listeners: list[dict[str, str]] = []

    for line in completed.stdout.splitlines():
        if "LISTEN" not in line:
            continue

        if f":{port} " not in line and f":{port}\t" not in line:
            continue

        parts = line.split()

        if len(parts) < 4:
            continue

        local_address = parts[3]
        pid = unix_pid_from_ss_line(line)

        listeners.append(
            {
                "local_address": local_address,
                "pid": pid,
                "process_name": unix_process_name(pid),
            }
        )

    return listeners


def collect_unix_port_listeners_with_lsof(port: int) -> list[dict[str, str]]:
    try:
        completed = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    listeners: list[dict[str, str]] = []

    for line in completed.stdout.splitlines()[1:]:
        parts = line.split()

        if len(parts) < 9:
            continue

        listeners.append(
            {
                "local_address": parts[8],
                "pid": parts[1],
                "process_name": parts[0],
            }
        )

    return listeners


def unix_pid_from_ss_line(line: str) -> str:
    marker = "pid="

    if marker not in line:
        return ""

    tail = line.split(marker, 1)[1]
    pid = ""

    for char in tail:
        if not char.isdigit():
            break

        pid += char

    return pid


def unix_process_name(pid: str) -> str:
    if pid == "":
        return ""

    process_comm = Path("/proc") / pid / "comm"

    try:
        return process_comm.read_text(encoding="utf-8").strip()
    except OSError:
        return ""

def windows_process_name(pid: str) -> str:
    try:
        completed = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""

    output = completed.stdout.strip()

    if output == "" or output.lower().startswith("info:"):
        return ""

    reader = csv.reader(io.StringIO(output))

    try:
        row = next(reader)
    except StopIteration:
        return ""

    if len(row) == 0:
        return ""

    return row[0]

class FriendlyNodeThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self) -> None:
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(
                socket.SOL_SOCKET,
                socket.SO_EXCLUSIVEADDRUSE,
                1,
            )
        elif hasattr(socket, "SO_REUSEADDR"):
            self.socket.setsockopt(
                socket.SOL_SOCKET,
                socket.SO_REUSEADDR,
                1,
            )

        try:
            self.socket.bind(self.server_address)
        except OSError as exc:
            host, port = self.server_address[:2]
            port_number = int(port)

            diagnostics = describe_port_listeners(port_number)
            listener_items = collect_port_listeners(port_number)

            pids = sorted(
                {
                    item["pid"]
                    for item in listener_items
                    if item.get("pid", "") != ""
                }
            )

            stop_commands = stop_listener_commands(pids)

            message_lines = [
                f"FriendlyNode controller port is not available on {host}:{port}: {exc.strerror}",
            ]

            if len(diagnostics) > 0:
                message_lines.append("Current listener(s) on this port:")
                message_lines.extend(f"  {line}" for line in diagnostics)

                if len(stop_commands) > 0:
                    message_lines.append("To stop stale listener(s), run:")
                    for command in stop_commands:
                        message_lines.append(f"  {command}")
            else:
                message_lines.append("No owner information was available from OS port diagnostics.")

            raise ControllerPortBindError(
                exc.errno or 0,
                "\n".join(message_lines),
            ) from exc

        self.server_address = self.socket.getsockname()


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
        self.process_restart_requested = False
        handler_class = self._build_handler()
        self.listen_hosts = self.app.config.controller_listen_hosts()
        self.httpds = self._build_http_servers(handler_class)

    def _build_http_servers(
            self,
            handler_class: type[BaseHTTPRequestHandler],
    ) -> list[FriendlyNodeThreadingHTTPServer]:
        httpds: list[FriendlyNodeThreadingHTTPServer] = []

        try:
            for listen_host in self.listen_hosts:
                httpd = FriendlyNodeThreadingHTTPServer(
                    (listen_host, self.port),
                    handler_class,
                )
                httpds.append(httpd)

            return httpds

        except OSError:
            for httpd in httpds:
                httpd.server_close()

            raise

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
        self._shutdown_after_response()

    def request_process_restart(self) -> None:
        self.process_restart_requested = True
        self._shutdown_after_response()

    def _shutdown_after_response(self) -> None:
        thread = threading.Thread(target=self._shutdown_servers_after_response, daemon=True)
        thread.start()

    def _shutdown_servers_after_response(self) -> None:
        time.sleep(0.6)

        for httpd in self.httpds:
            httpd.shutdown()

    def _running_under_debugger(self) -> bool:
        if os.environ.get("PYCHARM_HOSTED") == "1":
            return True

        if sys.gettrace() is not None:
            return True

        return any(module_name.startswith("pydevd") for module_name in sys.modules)

    def _build_handler(self) -> type[BaseHTTPRequestHandler]:
        app = self.app
        web_root = self.web_root
        server_port = self.port
        controller_server = self

        class FriendlyNodeRequestHandler(BaseHTTPRequestHandler):
            server_version = "FriendlyNodeHTTP/0.1"

            def handle(self) -> None:
                try:
                    super().handle()
                except OSError as exc:
                    if is_client_disconnect_error(exc):
                        self.close_connection = True
                        return
                    raise

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
                    params = parse_qs(parsed.query)
                    self._send_json(
                        app.list_announces(
                            limit=self._query_int(params, "limit", 500),
                            filters=self._announce_filters_from_query(params),
                        )
                    )
                    return
                if parsed.path == "/api/announces/stream":
                    params = parse_qs(parsed.query)
                    self._serve_announce_stream(
                        limit=self._query_int(params, "limit", 500),
                        filters=self._announce_filters_from_query(params),
                        after_id=self._query_int(params, "after_id", 0),
                    )
                    return
                if parsed.path == "/api/nomadnet/nodes":
                    self._send_json(app.list_nomadnet_nodes())
                    return
                if parsed.path == "/api/nomadnet/pages":
                    self._send_json(app.list_nomadnet_pages())
                    return

                if parsed.path == "/api/nomadnet/browser-state":
                    self._send_json(app.get_nomadnet_browser_state())
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
                    discovery_hints = {
                        "bookmark_id": params.get("bookmark_id", [""])[0],
                        "last_interface": params.get("last_interface", [""])[0],
                        "last_announce_at": params.get("last_announce_at", [""])[0],
                        "last_transport_key": params.get("last_transport_key", [""])[0],
                    }
                    self._send_json(app.fetch_nomadnet_page(destination_hash, path, discovery_hints=discovery_hints))
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
                    self._send_json(
                        {
                            "status": "process_restarting",
                            "message": "Reticulum cannot be safely restarted in-process; restarting FriendlyNode process.",
                        }
                    )
                    controller_server.request_process_restart()
                    return

                if parsed.path == "/api/reticulum/announce":
                    payload = self._read_json_body()
                    self._send_json(app.make_announce(payload))
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

                    runtime = app.select_runtime(runtime_name)
                    self._send_json(
                        {
                            "status": "process_restarting",
                            "message": "Runtime selected. FriendlyNode process restart requested.",
                            "runtime": runtime.to_dict(),
                        }
                    )
                    controller_server.request_process_restart()
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

                    runtime = app.install_reticulum_release(version)
                    self._send_json(
                        {
                            "status": "process_restarting",
                            "message": "Runtime installed and selected. FriendlyNode process restart requested.",
                            "runtime": runtime.to_dict(),
                        }
                    )
                    controller_server.request_process_restart()
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

                if parsed.path == "/api/nomadnet/page":
                    payload = self._read_json_body()
                    destination_hash = str(payload.get("destination_hash") or "")
                    path = str(payload.get("path") or "/page/index.mu")
                    discovery_hints = payload.get("discovery_hints") or {}
                    request_data = payload.get("request_data") or {}

                    if not isinstance(discovery_hints, dict):
                        discovery_hints = {}

                    if not isinstance(request_data, dict):
                        self._send_json(
                            {"error": "bad_request", "message": "request_data must be an object"},
                            HTTPStatus.BAD_REQUEST,
                        )
                        return

                    self._send_json(
                        app.fetch_nomadnet_page(
                            destination_hash,
                            path,
                            discovery_hints=discovery_hints,
                            request_data=request_data,
                        )
                    )
                    return

                if parsed.path == "/api/nomadnet/browser-state":
                    payload = self._read_json_body()
                    self._send_json(app.save_nomadnet_browser_state(payload))
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
                    "announces": app.state.snapshot_announces(limit=500),
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

            def _serve_announce_stream(
                self,
                *,
                limit: int,
                filters: dict[str, object],
                after_id: int,
            ) -> None:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.end_headers()

                last_id = after_id

                try:
                    self._write_sse_event("ready", {"after_id": last_id})

                    while not controller_server.restart_requested:
                        records = app.wait_for_announces(
                            after_id=last_id,
                            timeout=15,
                            limit=limit,
                            filters=filters,
                        )

                        if len(records) == 0:
                            self.wfile.write(b": keepalive\n\n")
                            self.wfile.flush()
                            continue

                        for record in records:
                            try:
                                last_id = max(last_id, int(record.get("id") or 0))
                            except (TypeError, ValueError):
                                pass

                            self._write_sse_event("announce", record)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    return

            def _write_sse_event(self, event_name: str, payload: dict[str, object]) -> None:
                data = json.dumps(payload, sort_keys=True)
                self.wfile.write(f"event: {event_name}\n".encode("utf-8"))
                self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                self.wfile.flush()

            def _announce_filters_from_query(self, params: dict[str, list[str]]) -> dict[str, object]:
                return {
                    "type": self._query_text(params, "type"),
                    "name": self._query_text(params, "name"),
                    "destination": self._query_text(params, "destination"),
                    "identity": self._query_text(params, "identity"),
                    "lxmf": self._query_text(params, "lxmf"),
                    "text": self._query_text(params, "text"),
                    "hops": self._query_int(params, "hops", 0),
                }

            def _query_text(self, params: dict[str, list[str]], key: str) -> str:
                values = params.get(key, [""])
                return str(values[0] if len(values) > 0 else "").strip()

            def _query_int(
                self,
                params: dict[str, list[str]],
                key: str,
                default: int,
            ) -> int:
                try:
                    return int(params.get(key, [default])[0])
                except (TypeError, ValueError):
                    return default

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
