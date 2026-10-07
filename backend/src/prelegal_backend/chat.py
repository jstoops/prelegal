"""The AI chat: one stateless turn per request. The LLM either works out which
document the user needs or fills in the chosen document's Cover Page.

Each turn's structured output may also pick (or switch) the document. When it
does, the LLM is asked again with the new document's prompt, so the reply is
written knowing that document's fields and defaults.
"""

import json
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, create_model

from prelegal_backend.documents import (
    Catalog,
    CamelModel,
    DocumentData,
    DocumentDefinition,
    apply_updates,
)
from prelegal_backend.llm import Complete, LlmError

MAX_MESSAGES = 50
MAX_MESSAGE_LENGTH = 4000


class ChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ChatRequest(CamelModel):
    # Empty for the opening greeting.
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    data: DocumentData
    # The user's local date; the server's date is used if missing.
    today: date | None = Field(default=None, ge=date(2000, 1, 1), le=date(2999, 12, 31))


class ChatResponse(CamelModel):
    reply: str
    data: DocumentData


REPLY_DESCRIPTION = "Your message to the user."


def output_model(catalog: Catalog, doc: DocumentDefinition | None) -> type[BaseModel]:
    """The structured output for a turn: the document choice, then (once a document
    is chosen) its field updates, then the reply, which is written last so it
    knows what was changed."""
    document_id = (
        Literal[tuple(catalog.ids)] | None,
        Field(
            description="The id of the document to draft, once the user has chosen or "
            "agreed to one; null to keep the current choice."
        ),
    )
    reply = (str, Field(description=REPLY_DESCRIPTION))
    if doc is None:
        return create_model("ChooseDocument", documentId=document_id, reply=reply)
    updates = (
        catalog.updates_model(doc),
        Field(description="Cover Page values to change; null for every field that stays as it is."),
    )
    return create_model("FillDocument", documentId=document_id, updates=updates, reply=reply)


COMMON_PROMPT = """\
You are Prelegal's assistant. You help the user draft legal agreements from \
Common Paper's standard templates by chatting with them and filling in the \
agreement's Cover Page. The user sees the document update in a live preview \
next to the chat, and can download it as a PDF.

These are the only documents you can draft (id: name - what it's for):
{catalog}

Today is {today}. The next two weeks, for resolving relative dates:
{calendar}
"""

CHOOSE_PROMPT = """
No document has been chosen yet.

How to work:
- If there are no messages from the user yet, greet them briefly, say you can \
help draft common business agreements, and ask what they need the agreement for.
- Work out which document fits the user's needs. Ask a short clarifying \
question if it isn't clear.
- Set documentId only once the user has named a document from the list or \
clearly agreed to your suggestion. Otherwise leave it null.
- If the user wants a document that isn't in the list (for example an \
employment contract, a lease or a will), explain that you can't draft that one, \
suggest the closest document from the list and say briefly how it differs, and \
ask whether they'd like to draft that instead.
- Keep replies short and friendly, in plain text without Markdown.
- Don't give legal advice; suggest a lawyer for that.
"""

FILL_PROMPT = """
The user is drafting a {name}. The two parties are {party1} (party1) and \
{party2} (party2).

The Cover Page fields (key: label - meaning):
{fields}
- For each party: company name, signer's name, signer's title, and an email or \
postal address for notices.

Current values (an empty date means today):
{data}

Pre-filled terms the user hasn't changed:
{prefilled}

Still missing: {missing}.

How to work:
- If there are no messages from the user yet, greet them briefly and explain \
that you'll fill in the {name} together as you chat, and that they'll see it \
update on the right. Then ask your first question.
- In your first questions, before moving on to the rest, check the pre-filled \
terms above with the user: list them briefly and ask whether they're correct or \
what they'd like to change. Only treat them as agreed once the user says so, \
and don't ask again about terms they've already confirmed.
- Then ask about one or two fields at a time, in a natural order: the parties \
first, then the remaining missing fields.
- Only set fields to values the user has stated or clearly agreed to. Never \
invent names, companies or addresses. Leave every other field null.
- When you set a field, briefly confirm what you filled in, then ask about the \
next missing field. Every reply ends with a question until nothing is missing.
- Resolve relative dates ("next Monday", "1 March") using the dates above and \
write them as YYYY-MM-DD.
- Keep replies short and friendly, in plain text without Markdown.
- Don't give legal advice; suggest a lawyer for that.
- If the user wants a different document from the list, set documentId to it \
once they confirm. If they want one that isn't in the list, explain that you \
can't draft it, suggest the closest document from the list, and ask whether \
they'd like to switch.
- Once nothing is missing, tell the user they can review the preview and click \
"Download PDF", and offer to change anything else.
"""

# Some providers reject a conversation with no user turn, so the greeting is
# requested with this stand-in message (never shown to the user).
GREETING_REQUEST = "(The user has just opened the document creator.)"

PARTY_FIELD_LABELS = {
    "company": "company",
    "print_name": "signer's name",
    "title": "signer's title",
    "notice_address": "notice address",
}


def missing_fields(doc: DocumentDefinition, data: DocumentData) -> list[str]:
    """Blank fields the document needs, in the order the assistant should ask about them."""
    missing = [
        f"{label} {field_label}"
        for label, party in zip(doc.parties, data.parties)
        for field, field_label in PARTY_FIELD_LABELS.items()
        if not getattr(party, field).strip()
    ]
    missing += [f.label for f in doc.fields if f.required and not str(data.fields[f.key]).strip()]
    return missing


def prefilled_terms(doc: DocumentDefinition, data: DocumentData) -> list[str]:
    """The terms still at their defaults, as the Cover Page shows them."""
    embedded = doc.embedded_keys()
    terms = []
    for field in doc.fields:
        if field.key in embedded or data.fields[field.key] != field.default_value:
            continue
        if field.kind == "date":
            terms.append(f"{field.label}: today (unless the user gives a date)")
        elif data.fields[field.key] != "":
            terms.append(f"{field.label}: {doc.display_value(field, data.fields)}")
        elif field.empty_text:
            terms.append(f"{field.label}: {field.empty_text} (optional)")
    return terms


def _bullets(lines: list[str]) -> str:
    return "\n".join(f"- {line}" for line in lines) or "- none"


def system_prompt(catalog: Catalog, data: DocumentData, today: date) -> str:
    prompt = COMMON_PROMPT.format(
        catalog=_bullets([f"{d.id}: {d.name} - {d.description}" for d in catalog.documents]),
        today=f"{today:%A}, {today.isoformat()}",
        # The model is unreliable at date arithmetic, so it looks dates up instead.
        calendar=_bullets(
            [f"{day:%A}: {day.isoformat()}" for day in (today + timedelta(days=n) for n in range(1, 15))]
        ),
    )
    doc = catalog.get(data.document_id)
    if doc is None:
        return prompt + CHOOSE_PROMPT
    missing = missing_fields(doc, data)
    return prompt + FILL_PROMPT.format(
        name=doc.name,
        party1=doc.parties[0],
        party2=doc.parties[1],
        fields=_bullets(
            [f"{f.key}: {f.label}{' (required)' if f.required else ''} - {f.guidance}" for f in doc.fields]
        ),
        data=json.dumps(data.model_dump(by_alias=True, exclude={"document_id"}), indent=2),
        prefilled=_bullets(prefilled_terms(doc, data)),
        missing=", ".join(missing) if missing else f"nothing, the {doc.name} is complete",
    )


def build_messages(
    catalog: Catalog, request: ChatRequest, data: DocumentData, today: date
) -> list[dict[str, str]]:
    history = [{"role": m.role, "content": m.content} for m in request.messages]
    if not history:
        history = [{"role": "user", "content": GREETING_REQUEST}]
    return [{"role": "system", "content": system_prompt(catalog, data, today)}, *history]


def _turn(
    complete: Complete, catalog: Catalog, request: ChatRequest, data: DocumentData, today: date
) -> tuple[Any, DocumentData]:
    """Asks the LLM once; returns its output and `data` with its field updates applied."""
    doc = catalog.get(data.document_id)
    output = complete(build_messages(catalog, request, data, today), output_model(catalog, doc))
    if doc is not None:
        data = apply_updates(doc, data, output.updates)
    return output, data


def run_chat(complete: Complete, catalog: Catalog, request: ChatRequest, today: date) -> ChatResponse:
    """One chat turn: asks the LLM for a reply and applies its updates.

    `request.data` must already be normalized (`Catalog.normalize`).
    """
    output, data = _turn(complete, catalog, request, request.data, today)
    if output.documentId and output.documentId != request.data.document_id:
        # A new document: its updates (if any) were for the old one, so ask again
        # with the new document's prompt. A second switch in one turn is ignored.
        data = catalog.switch(request.data, output.documentId)
        output, data = _turn(complete, catalog, request, data, today)
    if not output.reply.strip():
        raise LlmError("The model returned an empty reply")
    return ChatResponse(reply=output.reply.strip(), data=data)
