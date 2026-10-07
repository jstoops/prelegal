"""Mutual NDA chat: the document's data model, the LLM's output schema and prompt,
and how each chat turn's field updates are merged into the document.

`NdaData` mirrors `NdaData` in frontend/lib/nda.ts and uses the same camelCase
keys on the wire.
"""

import json
from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from prelegal_backend.llm import Complete, LlmError

MIN_YEARS = 1
MAX_YEARS = 99
MAX_MESSAGES = 50
MAX_MESSAGE_LENGTH = 4000
# The whole NDA goes into every prompt, so its text is capped too.
MAX_TEXT_LENGTH = 2000
MAX_FIELD_LENGTH = 300


def _iso_date_or_blank(value: str) -> str:
    if value:
        date.fromisoformat(value)  # raises ValueError, e.g. for 2027-02-30
    return value


TermType = Literal["fixed", "open"]
Years = Annotated[int, Field(ge=MIN_YEARS, le=MAX_YEARS)]
Text = Annotated[str, Field(max_length=MAX_TEXT_LENGTH)]
ShortText = Annotated[str, Field(max_length=MAX_FIELD_LENGTH)]
IsoDateOrBlank = Annotated[
    str, Field(pattern=r"^(\d{4}-\d{2}-\d{2})?$"), AfterValidator(_iso_date_or_blank)
]


class CamelModel(BaseModel):
    # validate_assignment lets `apply_updates` reject invalid values field by field.
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, validate_assignment=True
    )


class Party(CamelModel):
    print_name: ShortText
    title: ShortText
    company: ShortText
    notice_address: ShortText


class NdaData(CamelModel):
    purpose: Text
    # Empty when not set, which the frontend shows as today.
    effective_date: IsoDateOrBlank
    mnda_term_type: TermType
    mnda_term_years: Years
    confidentiality_type: TermType
    confidentiality_years: Years
    governing_law: ShortText
    jurisdiction: ShortText
    modifications: Text
    parties: tuple[Party, Party]


# The LLM's structured output. Every field is required but nullable (null means
# "unchanged"), with no numeric bounds or tuples, so strict JSON-schema mode
# accepts it. Values are checked in `apply_updates` instead.


class PartyUpdates(CamelModel):
    print_name: str | None = Field(description="Name of the person signing for this party.")
    title: str | None = Field(description="Job title of the signer.")
    company: str | None = Field(description="Legal name of the company.")
    notice_address: str | None = Field(
        description="Email or postal address for legal notices."
    )


class NdaUpdates(CamelModel):
    purpose: str | None = Field(
        description="How Confidential Information may be used, as a sentence."
    )
    effective_date: str | None = Field(description="Effective Date as YYYY-MM-DD.")
    mnda_term_type: TermType | None = Field(
        description='"fixed": the MNDA expires after mndaTermYears; '
        '"open": it continues until terminated.'
    )
    mnda_term_years: int | None = Field(description="MNDA term in whole years, 1 to 99.")
    confidentiality_type: TermType | None = Field(
        description='"fixed": information is protected for confidentialityYears '
        'after the Effective Date; "open": in perpetuity.'
    )
    confidentiality_years: int | None = Field(
        description="Term of confidentiality in whole years, 1 to 99."
    )
    governing_law: str | None = Field(description='Governing law, e.g. "Delaware".')
    jurisdiction: str | None = Field(
        description='Courts with jurisdiction, e.g. "courts located in New Castle, DE".'
    )
    modifications: str | None = Field(
        description="Any modifications to the Standard Terms; empty string for none."
    )
    party1: PartyUpdates | None = Field(description="Updates to Party 1.")
    party2: PartyUpdates | None = Field(description="Updates to Party 2.")


class NdaChatOutput(CamelModel):
    # Updates come first so the reply is written knowing what was changed.
    updates: NdaUpdates = Field(
        description="Fields to change in the NDA; null for every field that stays as it is."
    )
    reply: str = Field(
        description="Your message to the user: confirm what you changed, then ask "
        "about the next missing field (unless nothing is missing)."
    )


class ChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ChatRequest(CamelModel):
    # Empty for the opening greeting.
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    data: NdaData
    # The user's local date; the server's date is used if missing.
    today: date | None = Field(default=None, ge=date(2000, 1, 1), le=date(2999, 12, 31))


class ChatResponse(CamelModel):
    reply: str
    data: NdaData


def _merge[M: CamelModel](model: M, updates: dict) -> M:
    """Returns a copy of `model` with each non-null update that passes validation."""
    merged = model.model_copy()
    for field, value in updates.items():
        if value is None:
            continue
        try:
            setattr(merged, field, value.strip() if isinstance(value, str) else value)
        except ValidationError:
            pass  # e.g. 0 years or a malformed date from the LLM: keep the current value
    return merged


def apply_updates(data: NdaData, updates: NdaUpdates) -> NdaData:
    """Returns `data` with the LLM's non-null updates applied; invalid values are ignored."""
    merged = _merge(data, updates.model_dump(exclude={"party1", "party2"}))
    merged.parties = tuple(
        _merge(party, party_updates.model_dump() if party_updates else {})
        for party, party_updates in zip(data.parties, (updates.party1, updates.party2))
    )
    return merged


SYSTEM_PROMPT = """\
You are Prelegal's assistant. You help the user draft a Mutual Non-Disclosure \
Agreement (MNDA) based on the Common Paper Mutual NDA Standard Terms, by \
chatting with them and filling in its Cover Page.

Today is {today}. The next two weeks, for resolving relative dates:
{calendar}

The Cover Page fields are:
- Purpose: how Confidential Information may be used.
- Effective Date: when the MNDA starts. If not set, it is today.
- MNDA Term: either expires a number of years (1-99) after the Effective Date, \
or continues until terminated.
- Term of Confidentiality: either a number of years (1-99) after the Effective \
Date, or in perpetuity.
- Governing Law: the state or country whose laws govern the MNDA.
- Jurisdiction: the courts that will hear disputes.
- MNDA Modifications: any changes to the Standard Terms (optional).
- For each of the two parties: company name, signer's name, signer's title, \
and an email or postal address for notices.

Current Cover Page values (an empty effectiveDate means today):
{data}

Still missing: {missing}.

How to work:
- If there are no messages from the user yet, greet them briefly, explain that \
you'll fill in the NDA together as you chat and they'll see it update on the \
right, and ask your first question.
- Ask about one or two fields at a time, in a natural order: the parties first, \
then the purpose, dates and terms, then governing law and jurisdiction.
- Only set fields to values the user has stated or clearly agreed to. Never \
invent names, companies or addresses. Leave every other field null.
- When you set a field, briefly confirm what you filled in, then ask about the \
next missing field. Every reply ends with a question until nothing is missing.
- Resolve relative dates ("next Monday", "1 March") using the dates above and \
write them as YYYY-MM-DD.
- The current values above may include defaults the user hasn't confirmed; \
mention them when relevant rather than asking about every field from scratch.
- Keep replies short and friendly, in plain text without Markdown.
- Don't give legal advice; suggest a lawyer for that. Only the Mutual NDA can \
be drafted for now, so politely steer other requests back to it.
- Once nothing is missing, tell the user they can review the preview and click \
"Download PDF", and offer to change anything else.
"""

# Some providers reject a conversation with no user turn, so the greeting is
# requested with this stand-in message (never shown to the user).
GREETING_REQUEST = "(The user has just opened the Mutual NDA creator.)"


PARTY_FIELD_LABELS = {
    "company": "company",
    "print_name": "signer's name",
    "title": "signer's title",
    "notice_address": "notice address",
}
REQUIRED_FIELD_LABELS = {
    "purpose": "Purpose",
    "governing_law": "Governing Law",
    "jurisdiction": "Jurisdiction",
}


def missing_fields(data: NdaData) -> list[str]:
    """Blank fields the NDA needs, in the order the assistant should ask about them."""
    missing = [
        f"Party {number} {label}"
        for number, party in enumerate(data.parties, start=1)
        for field, label in PARTY_FIELD_LABELS.items()
        if not getattr(party, field).strip()
    ]
    missing += [
        label for field, label in REQUIRED_FIELD_LABELS.items() if not getattr(data, field).strip()
    ]
    return missing


def build_messages(request: ChatRequest, today: date) -> list[dict[str, str]]:
    missing = missing_fields(request.data)
    system = SYSTEM_PROMPT.format(
        today=f"{today:%A}, {today.isoformat()}",
        # The model is unreliable at date arithmetic, so it looks dates up instead.
        calendar="\n".join(
            f"- {day:%A}: {day.isoformat()}"
            for day in (today + timedelta(days=n) for n in range(1, 15))
        ),
        data=json.dumps(request.data.model_dump(by_alias=True), indent=2),
        missing=", ".join(missing) if missing else "nothing, the NDA is complete",
    )
    history = [{"role": m.role, "content": m.content} for m in request.messages]
    if not history:
        history = [{"role": "user", "content": GREETING_REQUEST}]
    return [{"role": "system", "content": system}, *history]


def run_chat(complete: Complete, request: ChatRequest, today: date) -> ChatResponse:
    """One chat turn: asks the LLM for a reply and applies its field updates."""
    output = complete(build_messages(request, today), NdaChatOutput)
    if not output.reply.strip():
        raise LlmError("The model returned an empty reply")
    return ChatResponse(
        reply=output.reply.strip(), data=apply_updates(request.data, output.updates)
    )
