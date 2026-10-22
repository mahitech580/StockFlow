"""SQLAlchemy engine, session factory, and database lifecycle helpers."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=False)


def configured_database_url() -> str:
    """Return normalized SQLAlchemy URL for SQLite, PostgreSQL, or MySQL."""
    url = os.getenv("DATABASE_URL", "sqlite:///./stockflow.db").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("mysql://"):
        return "mysql+pymysql://" + url[len("mysql://"):]
    return url


DATABASE_URL = configured_database_url()
engine_options: dict[str, object] = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False, "timeout": 30}
engine: Engine = create_engine(DATABASE_URL, **engine_options)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    """Declarative base shared by all application models."""


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that guarantees each request closes its session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create missing tables; suitable for local setup and first deployment boot."""
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print(f"StockFlow database initialized using {DATABASE_URL.split(':', 1)[0]}.")
