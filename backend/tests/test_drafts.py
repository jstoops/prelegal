"""Saving documents through the chat, and the saved-documents API."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from prelegal_backend.config import Settings
from prelegal_backend.llm import LlmError

from conftest import FakeLlm
from test_chat import FULL_PARTY, NDA, NO_DOCUMENT, chat, doc_data

HELLO = [{"role": "assistant", "content": "Hi!"}, {"role": "user", "content": "An NDA please"}]


def turn(client: TestClient, messages=HELLO, data=NDA, saved_id=None):
    response = chat(client, messages, data, savedId=saved_id)
    assert response.status_code == 200, response.text
    return response.json()


def documents(client: TestClient) -> list[dict]:
    response = client.get("/api/documents")
    assert response.status_code == 200
    return response.json()["documents"]


class TestSavingThroughTheChat:
    def test_first_message_with_a_document_creates_a_draft(
        self, chat_client: TestClient, fake_llm: FakeLlm
    ):
        fake_llm.outputs = [{"reply": "Who are the parties?"}]

        result = turn(chat_client)

        assert result["savedId"]
        [summary] = documents(chat_client)
        assert summary["id"] == result["savedId"]
        assert summary["documentId"] == "mutual-nda"
        assert summary["title"] == "Mutual Non-Disclosure Agreement"

        saved = chat_client.get(f"/api/documents/{result['savedId']}").json()
        assert saved["data"] == NDA
        # The stored conversation ends with the reply the user just saw.
        assert saved["messages"] == [*HELLO, {"role": "assistant", "content": "Who are the parties?"}]

    def test_the_greeting_is_not_saved(self, chat_client: TestClient):
        assert turn(chat_client, messages=[])["savedId"] is None
        assert documents(chat_client) == []

    def test_nothing_is_saved_until_a_document_is_chosen(self, chat_client: TestClient):
        assert turn(chat_client, data=NO_DOCUMENT)["savedId"] is None
        assert documents(chat_client) == []

    def test_choosing_a_document_saves_it(self, chat_client: TestClient, fake_llm: FakeLlm):
        fake_llm.outputs = [{"documentId": "pilot-agreement", "reply": "x"}, {"reply": "A pilot!"}]
        result = turn(chat_client, data=NO_DOCUMENT)
        assert result["savedId"]
        assert documents(chat_client)[0]["documentId"] == "pilot-agreement"

    def test_later_turns_update_the_same_draft(self, chat_client: TestClient, fake_llm: FakeLlm):
        first = turn(chat_client)
        [created] = documents(chat_client)
        fake_llm.outputs = [{"updates": {"party1": {"company": "Acme"}}, "reply": "Got it."}]
        history = [*HELLO, {"role": "assistant", "content": "Hello!"}, {"role": "user", "content": "Acme"}]

        second = turn(chat_client, history, NDA, first["savedId"])

        assert second["savedId"] == first["savedId"]
        [summary] = documents(chat_client)
        assert summary["title"] == "Mutual Non-Disclosure Agreement - Acme"
        saved = chat_client.get(f"/api/documents/{first['savedId']}").json()
        assert saved["data"]["parties"][0]["company"] == "Acme"
        assert len(saved["messages"]) == 5
        assert summary["updatedAt"] > created["updatedAt"]

    def test_switching_documents_updates_the_draft(self, chat_client: TestClient, fake_llm: FakeLlm):
        saved_id = turn(chat_client)["savedId"]
        fake_llm.calls = []  # outputs are picked by call count
        fake_llm.outputs = [{"documentId": "pilot-agreement", "reply": "x"}, {"reply": "Switched."}]

        turn(chat_client, data=NDA, saved_id=saved_id)

        [summary] = documents(chat_client)
        assert summary["documentId"] == "pilot-agreement"
        assert summary["title"] == "Pilot Agreement"

    def test_title_names_both_companies(self, chat_client: TestClient):
        data = doc_data("mutual-nda", parties=(FULL_PARTY, {**FULL_PARTY, "company": "Globex"}))
        turn(chat_client, data=data)
        assert documents(chat_client)[0]["title"] == "Mutual Non-Disclosure Agreement - Acme & Globex"

    def test_failed_turns_save_nothing(self, chat_client: TestClient, fake_llm: FakeLlm):
        fake_llm.error = LlmError("down")
        assert chat(chat_client, HELLO).status_code == 502
        assert documents(chat_client) == []

    def test_a_long_saved_conversation_can_be_continued(self, chat_client: TestClient):
        # Each turn saves the request plus the reply, so a saved conversation is
        # always one longer than the request that saved it.
        history = HELLO * 30
        saved_id = turn(chat_client, history)["savedId"]
        saved = chat_client.get(f"/api/documents/{saved_id}").json()["messages"]
        assert len(saved) == 61

        resumed = turn(chat_client, [*saved, {"role": "user", "content": "More"}], saved_id=saved_id)

        assert resumed["savedId"] == saved_id
        assert len(chat_client.get(f"/api/documents/{saved_id}").json()["messages"]) == 63

    def test_unknown_saved_id_is_404_before_calling_the_llm(
        self, chat_client: TestClient, fake_llm: FakeLlm
    ):
        response = chat(chat_client, HELLO, savedId="0" * 32)
        assert response.status_code == 404
        assert fake_llm.calls == []

    def test_cannot_write_to_another_users_draft(
        self, chat_client: TestClient, other_client: TestClient, fake_llm: FakeLlm
    ):
        saved_id = turn(chat_client)["savedId"]

        response = chat(other_client, HELLO, savedId=saved_id)

        assert response.status_code == 404
        assert len(fake_llm.calls) == 1  # alice's turn only
        assert documents(other_client) == []


class TestDocumentsApi:
    def test_lists_only_the_users_documents_newest_first(
        self, chat_client: TestClient, other_client: TestClient
    ):
        first = turn(chat_client)["savedId"]
        second = turn(chat_client, data=doc_data("pilot-agreement"))["savedId"]
        turn(other_client)

        assert [d["id"] for d in documents(chat_client)] == [second, first]
        # Updating the older one moves it to the top.
        turn(chat_client, saved_id=first)
        assert [d["id"] for d in documents(chat_client)] == [first, second]
        assert len(documents(other_client)) == 1

    def test_summary_shape(self, chat_client: TestClient):
        turn(chat_client)
        [summary] = documents(chat_client)
        assert set(summary) == {"id", "documentId", "title", "updatedAt"}

    def test_another_users_document_is_404(
        self, chat_client: TestClient, other_client: TestClient
    ):
        saved_id = turn(chat_client)["savedId"]
        assert other_client.get(f"/api/documents/{saved_id}").status_code == 404
        assert other_client.delete(f"/api/documents/{saved_id}").status_code == 404
        assert chat_client.get(f"/api/documents/{saved_id}").status_code == 200

    def test_missing_document_is_404(self, chat_client: TestClient):
        response = chat_client.get("/api/documents/nope")
        assert response.status_code == 404
        assert response.json() == {"detail": "Document not found."}

    def test_delete(self, chat_client: TestClient):
        saved_id = turn(chat_client)["savedId"]

        assert chat_client.delete(f"/api/documents/{saved_id}").status_code == 204

        assert documents(chat_client) == []
        assert chat_client.get(f"/api/documents/{saved_id}").status_code == 404
        assert chat_client.delete(f"/api/documents/{saved_id}").status_code == 404
        # A chat still pointing at it can't bring it back.
        assert chat(chat_client, HELLO, savedId=saved_id).status_code == 404

    def test_document_that_no_longer_fits_its_definition_is_422(
        self, chat_client: TestClient, settings: Settings
    ):
        saved_id = turn(chat_client)["savedId"]
        with closing(sqlite3.connect(settings.db_path)) as conn, conn:
            conn.execute(
                "UPDATE documents SET data = json_set(data, '$.fields.removedField', 'x')"
            )

        response = chat_client.get(f"/api/documents/{saved_id}")

        assert response.status_code == 422
        assert response.json() == {"detail": "This document can no longer be opened."}
        assert len(documents(chat_client)) == 1  # still listed, so it can be deleted

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "POST"])
    def test_other_methods_are_404(self, chat_client: TestClient, method):
        assert chat_client.request(method, "/api/documents/abc").status_code == 404
