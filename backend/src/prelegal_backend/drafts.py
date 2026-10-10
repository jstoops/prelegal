"""Users' saved documents ("drafts", to tell them apart from the catalog's
document definitions). Each holds the document's data and the chat that
produced it, so the user can pick the conversation up where they left off.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import TypeAdapter

from prelegal_backend.chat import ChatMessage
from prelegal_backend.db import connect, timestamp
from prelegal_backend.documents import Catalog, CamelModel, DocumentData

_messages = TypeAdapter(list[ChatMessage])


class DraftSummary(CamelModel):
    id: str
    document_id: str
    title: str
    updated_at: datetime


class Draft(DraftSummary):
    data: DocumentData
    messages: list[ChatMessage]


class DraftList(CamelModel):
    documents: list[DraftSummary]


class DraftNotFound(Exception):
    """No such draft, or it belongs to someone else (the two aren't told apart)."""


def title_for(catalog: Catalog, data: DocumentData) -> str:
    """The document's name, with the parties' companies once they're known."""
    name = catalog.get(data.document_id).name
    companies = [p.company for p in data.parties if p.company]
    return f"{name} - {' & '.join(companies)}" if companies else name


class Drafts:
    def __init__(self, db_path: Path, catalog: Catalog) -> None:
        self.db_path = db_path
        self.catalog = catalog

    def save(
        self, user_id: int, draft_id: str | None, data: DocumentData, messages: list[ChatMessage]
    ) -> str:
        """Creates a draft (no `draft_id`) or updates the user's draft; returns its id.
        `data` must be normalized and have a document."""
        row = {
            "user_id": user_id,
            "document_id": data.document_id,
            "title": title_for(self.catalog, data),
            "data": data.model_dump_json(by_alias=True),
            "messages": _messages.dump_json(messages, by_alias=True).decode(),
            "now": timestamp(),
        }
        with connect(self.db_path) as conn:
            if draft_id is None:
                draft_id = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO documents"
                    " (id, user_id, document_id, title, data, messages, created_at, updated_at)"
                    " VALUES (:id, :user_id, :document_id, :title, :data, :messages, :now, :now)",
                    {**row, "id": draft_id},
                )
            else:
                cursor = conn.execute(
                    "UPDATE documents SET document_id = :document_id, title = :title,"
                    " data = :data, messages = :messages, updated_at = :now"
                    " WHERE id = :id AND user_id = :user_id",
                    {**row, "id": draft_id},
                )
                if cursor.rowcount == 0:
                    raise DraftNotFound(draft_id)
        return draft_id

    def exists(self, user_id: int, draft_id: str) -> bool:
        with connect(self.db_path) as conn:
            return (
                conn.execute(
                    "SELECT 1 FROM documents WHERE id = ? AND user_id = ?", (draft_id, user_id)
                ).fetchone()
                is not None
            )

    def get(self, user_id: int, draft_id: str) -> Draft:
        """Raises `DraftNotFound`. The data is normalized again, in case documents.json
        changed since it was saved (which raises `InvalidDocument`)."""
        with connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE id = ? AND user_id = ?", (draft_id, user_id)
            ).fetchone()
        if row is None:
            raise DraftNotFound(draft_id)
        return Draft(
            id=row["id"],
            document_id=row["document_id"],
            title=row["title"],
            updated_at=row["updated_at"],
            data=self.catalog.normalize(DocumentData.model_validate_json(row["data"])),
            messages=_messages.validate_json(row["messages"]),
        )

    def for_user(self, user_id: int) -> list[DraftSummary]:
        """The user's drafts, most recently updated first."""
        with connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT id, document_id, title, updated_at FROM documents"
                " WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        return [DraftSummary.model_validate(dict(row)) for row in rows]

    def delete(self, user_id: int, draft_id: str) -> None:
        with connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM documents WHERE id = ? AND user_id = ?", (draft_id, user_id)
            )
        if cursor.rowcount == 0:
            raise DraftNotFound(draft_id)
