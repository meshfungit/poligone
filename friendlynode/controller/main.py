"""Controller entry point."""

from __future__ import annotations

import os
import sys

from friendlynode.controller.app import ControllerApp
from friendlynode.controller.http_server import ControllerHttpServer


def main() -> None:
    app = ControllerApp()
    server: ControllerHttpServer | None = None
    app_stopped = False

    try:
        app.start()

        while True:
            server = ControllerHttpServer(
                app,
                host=app.config.controller_host,
                port=app.config.controller_port,
            )

            server.serve_forever()

            restart_requested = server.restart_requested
            process_restart_requested = server.process_restart_requested

            server.close()
            server = None

            if process_restart_requested:
                print("FriendlyNode process restarting", flush=True)

                app.stop()
                app_stopped = True

                os.execv(
                    sys.executable,
                    [
                        sys.executable,
                        "-m",
                        "friendlynode.controller.main",
                    ],
                )

            if not restart_requested:
                break

            print("FriendlyNode HTTP server restarting", flush=True)

    except KeyboardInterrupt:
        print("FriendlyNode controller stopped by user", flush=True)

    finally:
        if server is not None:
            server.close()

        if not app_stopped:
            app.stop()


if __name__ == "__main__":
    main()
