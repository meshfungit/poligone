"""Controller entry point."""

from __future__ import annotations

from friendlynode.controller.app import ControllerApp
from friendlynode.controller.http_server import ControllerHttpServer


def main() -> None:
    app = ControllerApp()
    server: ControllerHttpServer | None = None

    try:
        app.start()
        server = ControllerHttpServer(app)
        server.serve_forever()
    except KeyboardInterrupt:
        print("FriendlyNode controller stopped by user")
    finally:
        if server is not None:
            server.close()
        app.stop()


if __name__ == "__main__":
    main()