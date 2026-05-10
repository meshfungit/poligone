"""SQLite storage stub."""

import sqlite3
from pathlib import Path

from friendlynode.config.defaults import DEFAULT_DATABASE_PATH


class Database:
    def __init__(self, path: Path = DEFAULT_DATABASE_PATH) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.path)

    def migrate(self) -> None:
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.commit()
