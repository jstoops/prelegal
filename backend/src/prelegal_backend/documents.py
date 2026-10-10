"""The documents users can draft, loaded from the repo's documents.json (shared with
the frontend), and how their Cover Page values are validated and updated.

A document's data travels as `DocumentData`: the chosen document's id (null until
one is chosen), its Cover Page `fields` keyed by the field keys in documents.json,
and the two parties. Keys stay camelCase on the wire, as in frontend/lib/document.ts.
"""

import json
import re
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    ValidationError,
    create_model,
    model_validator,
)
from pydantic.alias_generators import to_camel

MIN_YEARS = 1
MAX_YEARS = 99
# The whole document goes into every prompt, so its text is capped.
MAX_TEXT_LENGTH = 2000
MAX_FIELD_LENGTH = 300

FieldKind = Literal["text", "longtext", "date", "years", "choice"]
# Strict, so e.g. true isn't read as 1 year.
FieldValue = StrictStr | StrictInt
ShortText = Annotated[str, Field(max_length=MAX_FIELD_LENGTH)]

# A years field embedded in a choice option's text, e.g. "Expires {mndaTermYears}".
PLACEHOLDER = re.compile(r"\{(\w+)\}")

# Slips the LLM sometimes makes in text values:
# - Text instead of JSON null, such as "[null]" (copying the Cover Page's
#   "[Governing Law]" placeholders). Never a real value: it means "not given".
#   ("None" is left alone: it can mean e.g. no modifications.)
# - Text wrapped in quotes, such as '""' for empty or '"Delaware"'.
NOT_GIVEN = re.compile(r"\s*(null|undefined|\[[^\]]*\])\s*", re.IGNORECASE)
QUOTES = "\"'\u201c\u201d\u2018\u2019"  # straight and curly
QUOTED = re.compile(rf"\s*[{QUOTES}](.*)[{QUOTES}]\s*", re.DOTALL)


def tidy(value: Any) -> Any:
    """An LLM value with those slips undone: None if it's placeholder text,
    and text unwrapped from quotes. Other values are returned as they are."""
    if not isinstance(value, str):
        return value
    quoted = QUOTED.fullmatch(value)
    if quoted:
        value = quoted.group(1)
    return None if NOT_GIVEN.fullmatch(value) else value


class CamelModel(BaseModel):
    # validate_assignment lets `_merge_party` reject invalid values field by field.
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, validate_assignment=True
    )


class InvalidDocument(ValueError):
    """The request's document data doesn't match its definition."""


def years_text(years: int) -> str:
    """Mirrors `yearsText` in frontend/lib/document.ts."""
    return f"{years} year{'' if years == 1 else 's'}"


class ChoiceOption(CamelModel):
    value: str
    text: str


class FieldDefinition(CamelModel):
    key: str
    label: str
    kind: FieldKind
    guidance: str
    hint: str = ""
    section: str = ""
    required: bool = False
    default: FieldValue | None = None
    empty_text: str = ""
    options: list[ChoiceOption] = []

    @model_validator(mode="after")
    def _check(self) -> "FieldDefinition":
        if (self.kind == "choice") != bool(self.options):
            raise ValueError(f"{self.key}: choice fields, and only they, have options")
        # Explicit, so the frontend's `defaultValue` needs no fallbacks to keep in step.
        if self.kind in ("years", "choice") and self.default is None:
            raise ValueError(f"{self.key}: {self.kind} fields need a default")
        self.validate_value(self.default_value)
        return self

    @property
    def default_value(self) -> FieldValue:
        """Mirrors `defaultValue` in frontend/lib/document.ts."""
        return "" if self.default is None else self.default

    def validate_value(self, value: Any) -> FieldValue:
        """Returns the value (text stripped), or raises `InvalidDocument`."""
        problem = None
        if self.kind == "years":
            # bool is an int subclass, but true isn't a number of years.
            if type(value) is not int or not MIN_YEARS <= value <= MAX_YEARS:
                problem = f"must be whole years from {MIN_YEARS} to {MAX_YEARS}"
        elif not isinstance(value, str):
            problem = "must be a string"
        else:
            value = value.strip()
            limit = MAX_TEXT_LENGTH if self.kind == "longtext" else MAX_FIELD_LENGTH
            if len(value) > limit:
                problem = f"must be at most {limit} characters"
            elif self.kind == "choice" and value not in {o.value for o in self.options}:
                problem = "is not one of the options"
            elif self.kind == "date" and value and not _is_iso_date(value):
                problem = "must be a YYYY-MM-DD date"
        if problem:
            raise InvalidDocument(f"{self.key} {problem}")
        return value


def _is_iso_date(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)  # rejects e.g. 2027-02-30
    except ValueError:
        return False
    return True


class DocumentDefinition(CamelModel):
    id: str
    name: str
    description: str
    standard_terms: str
    file_slug: str
    parties: tuple[str, str]
    intro: str
    signing_statement: str
    attribution: str
    fields: list[FieldDefinition]

    @model_validator(mode="after")
    def _check(self) -> "DocumentDefinition":
        keys = [f.key for f in self.fields]
        if len(set(keys)) != len(keys):
            raise ValueError(f"{self.id}: duplicate field keys")
        for field in self.fields:
            for option in field.options:
                for key in PLACEHOLDER.findall(option.text):
                    target = self.field(key)
                    if target is None or target.kind != "years":
                        raise ValueError(f"{self.id}: {{{key}}} is not a years field")
        return self

    def field(self, key: str) -> FieldDefinition | None:
        return next((f for f in self.fields if f.key == key), None)

    def defaults(self) -> dict[str, FieldValue]:
        return {f.key: f.default_value for f in self.fields}

    def embedded_keys(self) -> set[str]:
        """Years fields shown inside a choice option rather than on their own."""
        return {
            key
            for field in self.fields
            for option in field.options
            for key in PLACEHOLDER.findall(option.text)
        }

    def display_value(self, field: FieldDefinition, fields: dict[str, FieldValue]) -> str:
        """The value as the Cover Page shows it, e.g. a choice's option text
        (as `coverPageSections` in frontend/lib/document.ts does)."""
        value = fields[field.key]
        if field.kind == "choice":
            text = next(o.text for o in field.options if o.value == value)
            return PLACEHOLDER.sub(lambda m: years_text(int(fields[m.group(1)])), text)
        if field.kind == "years":
            return years_text(int(value))
        return str(value)


class Party(CamelModel):
    print_name: ShortText
    title: ShortText
    company: ShortText
    notice_address: ShortText


class DocumentData(CamelModel):
    # None until a document is chosen.
    document_id: str | None
    fields: dict[str, FieldValue]
    parties: tuple[Party, Party]


def empty_party() -> Party:
    return Party(print_name="", title="", company="", notice_address="")


class Catalog:
    """All the documents that can be drafted, in documents.json order."""

    def __init__(self, documents: list[DocumentDefinition]) -> None:
        self.documents = documents
        self._by_id = {doc.id: doc for doc in documents}
        if len(self._by_id) != len(documents):
            raise ValueError("documents.json: duplicate document ids")
        self._updates_models = {doc.id: _updates_model(doc) for doc in documents}

    def get(self, document_id: str | None) -> DocumentDefinition | None:
        return self._by_id.get(document_id) if document_id else None

    @property
    def ids(self) -> list[str]:
        return list(self._by_id)

    def updates_model(self, doc: DocumentDefinition) -> type[BaseModel]:
        return self._updates_models[doc.id]

    def normalize(self, data: DocumentData) -> DocumentData:
        """Validates `data` against its document and fills in missing fields with
        their defaults. Raises `InvalidDocument` for unknown documents, unknown
        fields and invalid values."""
        if data.document_id is None:
            if data.fields:
                raise InvalidDocument("fields must be empty until a document is chosen")
            return data.model_copy(update={"parties": _tidy_parties(data.parties)})
        doc = self.get(data.document_id)
        if doc is None:
            raise InvalidDocument(f"unknown document {data.document_id!r}")
        unknown = set(data.fields) - {f.key for f in doc.fields}
        if unknown:
            raise InvalidDocument(f"unknown fields for {doc.id}: {', '.join(sorted(unknown))}")
        # Tidied, as documents saved before these checks may hold the LLM's slips.
        tidied = {key: tidy(value) for key, value in data.fields.items()}
        fields = doc.defaults() | {
            key: doc.field(key).validate_value(value)
            for key, value in tidied.items()
            if value is not None
        }
        return data.model_copy(update={"fields": fields, "parties": _tidy_parties(data.parties)})

    def switch(self, data: DocumentData, document_id: str) -> DocumentData:
        """`data` moved to another document. The parties and any field values the
        user chose (not the old document's defaults) carry over where the new
        document has a field with the same key and kind."""
        new = self._by_id[document_id]
        fields = new.defaults()
        old = self.get(data.document_id)
        if old is not None:
            for field in new.fields:
                old_field = old.field(field.key)
                value = data.fields.get(field.key)
                if old_field and old_field.kind == field.kind and value != old_field.default_value:
                    try:
                        fields[field.key] = field.validate_value(value)
                    except InvalidDocument:
                        pass  # e.g. a choice value the new document doesn't offer
        return DocumentData(document_id=new.id, fields=fields, parties=data.parties)


def load_catalog(path: Path) -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Catalog([DocumentDefinition.model_validate(doc) for doc in raw["documents"]])


# The LLM's structured output. Every field is required but nullable (null means
# "unchanged"), with no numeric bounds, so strict JSON-schema mode accepts it.
# Values are checked when they're applied instead.


def _tidy_parties(parties: tuple[Party, Party]) -> tuple[Party, Party]:
    """The parties with `tidy` applied (placeholder text becomes blank)."""
    return tuple(
        party.model_copy(
            update={k: (tidy(v) or "").strip() for k, v in party.model_dump().items()}
        )
        for party in parties
    )


NULL_GUIDANCE = (
    " Use JSON null when unknown or unchanged, never text such as \"null\", \"[null]\" or"
    " empty quotes."
)


class PartyUpdates(CamelModel):
    print_name: str | None = Field(
        description="Name of the person signing for this party." + NULL_GUIDANCE
    )
    title: str | None = Field(description="Job title of the signer." + NULL_GUIDANCE)
    company: str | None = Field(description="Legal name of the company." + NULL_GUIDANCE)
    notice_address: str | None = Field(
        description="Email or postal address for legal notices." + NULL_GUIDANCE
    )


def _updates_model(doc: DocumentDefinition) -> type[BaseModel]:
    """The output schema for one document's Cover Page fields."""

    def field_type(field: FieldDefinition) -> Any:
        if field.kind == "years":
            return int | None
        if field.kind == "choice":
            return Literal[tuple(o.value for o in field.options)] | None
        return str | None

    def description(field: FieldDefinition) -> str:
        extra = {
            "date": " As YYYY-MM-DD; empty string for today.",
            "years": f" Whole years, {MIN_YEARS} to {MAX_YEARS}.",
        }.get(field.kind, "")
        return f"{field.label}: {field.guidance}{extra}{NULL_GUIDANCE}"

    return create_model(
        # Model names become schema titles, so keep them identifier-like.
        f"Updates_{doc.id.replace('-', '_')}",
        **{f.key: (field_type(f), Field(description=description(f))) for f in doc.fields},
        party1=(PartyUpdates | None, Field(description=f"Updates to {doc.parties[0]}.")),
        party2=(PartyUpdates | None, Field(description=f"Updates to {doc.parties[1]}.")),
    )


def _merge_party(party: Party, updates: PartyUpdates | None) -> Party:
    merged = party.model_copy()
    for field, value in (updates.model_dump() if updates else {}).items():
        value = tidy(value)
        if value is None:
            continue
        try:
            setattr(merged, field, value.strip())
        except ValidationError:
            pass  # e.g. over the length limit: keep the current value
    return merged


def apply_updates(doc: DocumentDefinition, data: DocumentData, updates: BaseModel) -> DocumentData:
    """Returns `data` with the LLM's non-null updates applied; invalid values are ignored."""
    values = updates.model_dump()
    fields = dict(data.fields)
    for field in doc.fields:
        value = tidy(values.get(field.key))
        if value is None:
            continue
        try:
            fields[field.key] = field.validate_value(value)
        except InvalidDocument:
            pass  # e.g. 0 years or a malformed date from the LLM: keep the current value
    parties = (
        _merge_party(data.parties[0], updates.party1),
        _merge_party(data.parties[1], updates.party2),
    )
    return data.model_copy(update={"fields": fields, "parties": parties})
