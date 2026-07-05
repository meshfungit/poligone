"""Controller entry point."""

from __future__ import annotations

import os
import sys

from friendlynode.controller.app import ControllerApp
from friendlynode.controller.http_server import ControllerHttpServer, ControllerPortBindError


def main() -> None:
    app = ControllerApp()
    server: ControllerHttpServer | None = None
    app_started = False
    app_stopped = False

    try:
        while True:
            server = ControllerHttpServer(
                app,
                host=app.config.controller_host,
                port=app.config.controller_port,
            )

            if not app_started:
                app.start()
                app_started = True

            server.serve_forever()

            restart_requested = server.restart_requested
            process_restart_requested = server.process_restart_requested

            server.close()
            server = None

            if process_restart_requested:
                print("FriendlyNode process restarting", flush=True)

                app.stop()
                app_stopped = True

                restart_args = _restart_process_args()

                print(
                    "FriendlyNode exec: " + " ".join(restart_args),
                    flush=True,
                )

                os.execv(sys.executable, restart_args)

            if not restart_requested:
                break

            print("FriendlyNode HTTP server restarting", flush=True)

    except ControllerPortBindError as exc:
        print("", flush=True)
        print("[friendlynode] Controller HTTP port bind failed", flush=True)
        print(str(exc), flush=True)
        print("", flush=True)

    except KeyboardInterrupt:
        print("FriendlyNode controller stopped by user", flush=True)

    finally:
        if server is not None:
            server.close()

        if app_started and not app_stopped:
            app.stop()


def _restart_process_args() -> list[str]:
    original_args = getattr(sys, "orig_argv", None)

    if isinstance(original_args, list) and len(original_args) > 0:
        return [str(arg) for arg in original_args]

    return [
        sys.executable,
        "-m",
        "friendlynode.controller.main",
    ]


if __name__ == "__main__":
    main()
