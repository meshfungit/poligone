"""Desktop launcher stub.

Later this can hide the console, show a tray icon and open the local web UI.
"""

from friendlynode.controller.app import ControllerApp


def main() -> None:
    app = ControllerApp()
    app.start()
    print("FriendlyNode launcher stub started")


if __name__ == "__main__":
    main()
