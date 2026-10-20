"""A throwaway Postgres database for the tests that need real locks.

`SAFIA_TEST_PG` names a server the tests may create a database on, e.g.
``postgresql://me@localhost:5432/postgres``. Each test class gets a fresh
database with the whole schema, dropped again at the end; nothing touches the
app's own `DATABASE_URL`. Unset, those tests are skipped.
"""
from __future__ import annotations

import os
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

SERVER = os.environ.get("SAFIA_TEST_PG")


class ScratchDB:
    def __init__(self) -> None:
        from app.database import Base
        import app.models  # noqa: F401 — every table on Base.metadata

        server = make_url(SERVER)
        self.name = f"safia_t_{uuid.uuid4().hex[:10]}"
        self._admin = create_engine(server, isolation_level="AUTOCOMMIT")
        with self._admin.connect() as c:
            c.execute(text(f'CREATE DATABASE "{self.name}"'))
        self.engine = create_engine(server.set(database=self.name))
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)

    def drop(self) -> None:
        self.engine.dispose()
        with self._admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{self.name}" WITH (FORCE)'))
        self._admin.dispose()
