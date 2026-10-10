import json
import re
from pathlib import Path

import pytest

from prelegal_backend.config import REPO_ROOT
from prelegal_backend.documents import (
    MAX_FIELD_LENGTH,
    MAX_TEXT_LENGTH,
    Catalog,
    DocumentData,
    DocumentDefinition,
    InvalidDocument,
    PartyUpdates,
    apply_updates,
    empty_party,
    load_catalog,
)

from conftest import with_nulls

CATALOG = load_catalog(REPO_ROOT / "documents.json")
NDA = CATALOG.get("mutual-nda")


def nda_data(**fields) -> DocumentData:
    return DocumentData(
        document_id="mutual-nda",
        fields=NDA.defaults() | fields,
        parties=(empty_party(), empty_party()),
    )


def nda_updates(**values):
    model = CATALOG.updates_model(NDA)
    return model.model_validate(with_nulls(model, values))


def schema_keys(node) -> set[str]:
    """Every key in a JSON schema, at any depth (property names included)."""
    if isinstance(node, list):
        return set().union(*map(schema_keys, node))
    if isinstance(node, dict):
        return set(node).union(*map(schema_keys, node.values()))
    return set()


class TestDocumentsJson:
    def test_covers_every_template_in_the_catalog(self):
        catalog = json.loads((REPO_ROOT / "catalog.json").read_text(encoding="utf-8"))
        # Cover pages are defined in documents.json, so the NDA's cover-page
        # template is the one catalog file without a document of its own.
        files = {t["filename"] for t in catalog["templates"]} - {"templates/Mutual-NDA-coverpage.md"}
        assert {doc.standard_terms for doc in CATALOG.documents} == files

    def test_names_match_the_catalog(self):
        catalog = json.loads((REPO_ROOT / "catalog.json").read_text(encoding="utf-8"))
        names = {re.sub(r" - Standard Terms$", "", t["name"]) for t in catalog["templates"]}
        assert {doc.name for doc in CATALOG.documents} <= names

    def test_template_files_exist(self):
        for doc in CATALOG.documents:
            assert (REPO_ROOT / doc.standard_terms).is_file(), doc.id

    @pytest.mark.parametrize("doc", CATALOG.documents, ids=lambda d: d.id)
    def test_output_schema_is_strict_mode_friendly(self, doc: DocumentDefinition):
        """Strict structured outputs need every property required and no numeric bounds."""
        schema = CATALOG.updates_model(doc).model_json_schema()
        for model in [schema, *schema.get("$defs", {}).values()]:
            assert set(model["required"]) == set(model["properties"]), model["title"]
        assert not schema_keys(schema) & {"minimum", "maximum", "prefixItems", "default"}

    def test_rejects_a_placeholder_that_is_not_a_years_field(self):
        raw = json.loads((REPO_ROOT / "documents.json").read_text(encoding="utf-8"))
        nda = raw["documents"][0]
        nda["fields"][2]["options"][0]["text"] = "Expires {purpose}."
        with pytest.raises(ValueError, match="not a years field"):
            DocumentDefinition.model_validate(nda)

    def test_requires_defaults_for_years_and_choice_fields(self):
        raw = json.loads((REPO_ROOT / "documents.json").read_text(encoding="utf-8"))
        nda = raw["documents"][0]
        del nda["fields"][3]["default"]  # mndaTermYears
        with pytest.raises(ValueError, match="years fields need a default"):
            DocumentDefinition.model_validate(nda)

    def test_rejects_duplicate_ids(self):
        with pytest.raises(ValueError, match="duplicate document ids"):
            Catalog([NDA, NDA])

    def test_load_catalog_reads_a_file(self, tmp_path: Path):
        path = tmp_path / "documents.json"
        path.write_text(json.dumps({"documents": [NDA.model_dump(by_alias=True)]}))
        assert load_catalog(path).ids == ["mutual-nda"]


class TestNormalize:
    def test_fills_missing_fields_with_defaults(self):
        data = DocumentData(
            document_id="mutual-nda",
            fields={"governingLaw": " Delaware "},
            parties=(empty_party(), empty_party()),
        )
        fields = CATALOG.normalize(data).fields
        assert fields["governingLaw"] == "Delaware"
        assert fields["mndaTermYears"] == 1
        assert fields["mndaTermType"] == "fixed"
        assert fields["modifications"] == ""

    def test_clears_placeholder_text_saved_earlier(self):
        # Documents saved before placeholder text was filtered out still show it.
        party = empty_party().model_copy(
            update={"company": "Bananas Inc", "print_name": "[null]", "title": "null", "notice_address": "[null]"}
        )
        data = DocumentData(
            document_id="mutual-nda",
            fields={"governingLaw": "[null]", "jurisdiction": "Austin, TX"},
            parties=(party, party),
        )
        result = CATALOG.normalize(data)
        assert result.fields["governingLaw"] == ""
        assert result.fields["jurisdiction"] == "Austin, TX"
        for p in result.parties:
            assert p.model_dump() == {"print_name": "", "title": "", "company": "Bananas Inc", "notice_address": ""}

    def test_no_document_needs_no_fields(self):
        data = DocumentData(document_id=None, fields={}, parties=(empty_party(), empty_party()))
        assert CATALOG.normalize(data) == data

    @pytest.mark.parametrize(
        ("document_id", "fields", "problem"),
        [
            (None, {"purpose": "x"}, "fields must be empty"),
            ("lease", {}, "unknown document"),
            ("mutual-nda", {"cloudService": "x"}, "unknown fields"),
            ("mutual-nda", {"mndaTermYears": 0}, "whole years"),
            ("mutual-nda", {"mndaTermYears": 100}, "whole years"),
            ("mutual-nda", {"mndaTermYears": "2"}, "whole years"),
            ("mutual-nda", {"mndaTermType": "forever"}, "not one of the options"),
            ("mutual-nda", {"effectiveDate": "2027-02-30"}, "YYYY-MM-DD"),
            ("mutual-nda", {"effectiveDate": "15/01/2027"}, "YYYY-MM-DD"),
            ("mutual-nda", {"governingLaw": 5}, "must be a string"),
            ("mutual-nda", {"governingLaw": "x" * (MAX_FIELD_LENGTH + 1)}, "at most 300"),
            ("mutual-nda", {"purpose": "x" * (MAX_TEXT_LENGTH + 1)}, "at most 2000"),
        ],
    )
    def test_rejects_invalid_data(self, document_id, fields, problem):
        data = DocumentData(
            document_id=document_id, fields=fields, parties=(empty_party(), empty_party())
        )
        with pytest.raises(InvalidDocument, match=problem):
            CATALOG.normalize(data)


class TestSwitch:
    def test_starts_a_new_document_from_its_defaults(self):
        data = DocumentData(document_id=None, fields={}, parties=(empty_party(), empty_party()))
        switched = CATALOG.switch(data, "cloud-service-agreement")
        assert switched.document_id == "cloud-service-agreement"
        assert switched.fields == CATALOG.get("cloud-service-agreement").defaults()

    def test_carries_over_parties_and_values_the_user_chose(self):
        party = empty_party().model_copy(update={"company": "Acme"})
        data = nda_data(governingLaw="Delaware", effectiveDate="2027-01-15")
        data = data.model_copy(update={"parties": (party, empty_party())})

        switched = CATALOG.switch(data, "cloud-service-agreement")
        assert switched.parties[0].company == "Acme"
        assert switched.fields["governingLaw"] == "Delaware"
        assert switched.fields["effectiveDate"] == "2027-01-15"
        # NDA-only fields are dropped.
        assert "purpose" not in switched.fields

    def test_does_not_carry_over_the_old_documents_defaults(self):
        psa = CATALOG.get("professional-services-agreement")
        data = DocumentData(
            document_id=psa.id, fields=psa.defaults(), parties=(empty_party(), empty_party())
        )
        switched = CATALOG.switch(data, "software-license-agreement")
        sla_defaults = CATALOG.get("software-license-agreement").defaults()
        assert switched.fields["generalCapAmount"] == sla_defaults["generalCapAmount"]


class TestApplyUpdates:
    def test_null_updates_change_nothing(self):
        data = nda_data()
        assert apply_updates(NDA, data, nda_updates()) == data

    def test_strips_text_and_allows_clearing(self):
        data = nda_data(modifications="Old")
        result = apply_updates(NDA, data, nda_updates(jurisdiction="  Austin, TX ", modifications=""))
        assert result.fields["jurisdiction"] == "Austin, TX"
        assert result.fields["modifications"] == ""

    def test_updates_only_the_given_party_fields(self):
        data = nda_data()
        result = apply_updates(
            NDA, data, nda_updates(party1={"company": "Acme, Inc.", "printName": "Jane Doe"})
        )
        assert result.parties[0].company == "Acme, Inc."
        assert result.parties[0].print_name == "Jane Doe"
        assert result.parties[0].title == ""
        assert result.parties[1] == data.parties[1]

    @pytest.mark.parametrize("years", [0, 100, -3])
    def test_ignores_out_of_range_years(self, years: int):
        result = apply_updates(NDA, nda_data(), nda_updates(mndaTermYears=years))
        assert result.fields["mndaTermYears"] == 1

    def test_accepts_valid_years_and_choices(self):
        result = apply_updates(
            NDA, nda_data(), nda_updates(mndaTermYears=2, confidentialityType="open")
        )
        assert result.fields["mndaTermYears"] == 2
        assert result.fields["confidentialityType"] == "open"

    @pytest.mark.parametrize("value", ["15/01/2027", "2027-02-30", "20270115", "soon"])
    def test_ignores_invalid_dates(self, value: str):
        data = nda_data(effectiveDate="2026-10-05")
        result = apply_updates(NDA, data, nda_updates(effectiveDate=value))
        assert result.fields["effectiveDate"] == "2026-10-05"

    def test_ignores_text_over_the_length_limits(self):
        result = apply_updates(
            NDA,
            nda_data(),
            nda_updates(
                purpose="x" * (MAX_TEXT_LENGTH + 1),
                jurisdiction="Austin, TX",
                party2={"company": "x" * (MAX_FIELD_LENGTH + 1), "title": "CTO"},
            ),
        )
        assert result.fields["purpose"] == NDA.defaults()["purpose"]
        assert result.fields["jurisdiction"] == "Austin, TX"
        assert result.parties[1].company == ""
        assert result.parties[1].title == "CTO"

    def test_does_not_modify_the_original(self):
        data = nda_data()
        apply_updates(NDA, data, nda_updates(governingLaw="Delaware", party1={"title": "CEO"}))
        assert data == nda_data()

    @pytest.mark.parametrize("text", ["[null]", "null", " NULL ", "undefined", "[Print Name]", "[]"])
    def test_ignores_placeholder_text_from_the_llm(self, text: str):
        data = nda_data(governingLaw="Delaware")
        data.parties = (data.parties[0].model_copy(update={"title": "CEO"}), data.parties[1])
        result = apply_updates(
            NDA,
            data,
            nda_updates(
                governingLaw=text,
                party1={"company": "Acme", "printName": text, "title": text, "noticeAddress": text},
            ),
        )
        assert result.fields["governingLaw"] == "Delaware"
        assert result.parties[0].model_dump() == {
            "print_name": "",
            "title": "CEO",
            "company": "Acme",
            "notice_address": "",
        }

    def test_keeps_real_values_that_mention_null_or_brackets(self):
        result = apply_updates(
            NDA,
            nda_data(),
            nda_updates(
                modifications="None",
                purpose="Evaluating [Project X] for Null Industries",
                party1={"company": "Nullable Corp", "title": "Head of [R&D] ops"},
            ),
        )
        assert result.fields["modifications"] == "None"
        assert result.fields["purpose"] == "Evaluating [Project X] for Null Industries"
        assert result.parties[0].company == "Nullable Corp"
        assert result.parties[0].title == "Head of [R&D] ops"

    def test_tells_the_llm_to_use_json_null(self):
        schema = json.dumps(CATALOG.updates_model(NDA).model_json_schema())
        assert schema.count('never text such as \\"null\\" or \\"[null]\\"') >= 4 + len(NDA.fields)

    def test_party_updates_schema_uses_camel_case(self):
        assert set(PartyUpdates.model_json_schema()["properties"]) == {
            "printName",
            "title",
            "company",
            "noticeAddress",
        }


def test_display_value_fills_in_years():
    data = nda_data(mndaTermYears=3)
    field = NDA.field("mndaTermType")
    assert NDA.display_value(field, data.fields) == "Expires 3 years from Effective Date."
    assert NDA.embedded_keys() == {"mndaTermYears", "confidentialityYears"}
