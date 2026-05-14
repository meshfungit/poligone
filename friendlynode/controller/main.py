"""Controller entry point."""

from __future__ import annotations

from friendlynode.controller.app import ControllerApp
from friendlynode.controller.http_server import ControllerHttpServer


def main() -> None:
    app = ControllerApp()
    server: ControllerHttpServer | None = None

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
            server.close()
            server = None

            if not restart_requested:
                break

            print("FriendlyNode HTTP server restarting")
    except KeyboardInterrupt:
        print("FriendlyNode controller stopped by user")
    finally:
        if server is not None:
            server.close()
        app.stop()


if __name__ == "__main__":
    main()
