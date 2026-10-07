"use client";

import { useId, useState, type ReactNode } from "react";
import { inputClass } from "@/lib/styles";
import {
  COVER_HINTS,
  MAX_YEARS,
  MIN_YEARS,
  parseYears,
  type NdaData,
  type Party,
  type TermType,
} from "@/lib/nda";

interface NdaFormProps {
  data: NdaData;
  onChange: (data: NdaData) => void;
}

function LabelText({ label, hint, id }: { label: string; hint?: string; id?: string }) {
  return (
    <>
      <span id={id} className="block text-sm font-medium text-slate-700">
        {label}
      </span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <LabelText label={label} hint={hint} />
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** Like Field, but for a group of controls (which can't sit inside one label). */
function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <LabelText id={id} label={label} hint={hint} />
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * A "fixed number of years" vs. "open-ended" choice. The years box keeps the
 * user's raw text while typing and only commits whole numbers in range; on
 * blur it snaps back to the last valid value.
 */
function TermChoice({
  name,
  type,
  years,
  fixedLabel,
  yearsLabel,
  openLabel,
  onTypeChange,
  onYearsChange,
}: {
  name: string;
  type: TermType;
  years: number;
  fixedLabel: string;
  yearsLabel: string;
  openLabel: string;
  onTypeChange: (type: TermType) => void;
  onYearsChange: (years: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseYears(draft) === null;

  return (
    <div className="space-y-2 text-sm text-slate-700">
      <div className="flex items-center gap-2">
        <input
          id={`${id}-fixed`}
          type="radio"
          name={name}
          checked={type === "fixed"}
          onChange={() => onTypeChange("fixed")}
          className="accent-brand"
        />
        <label htmlFor={`${id}-fixed`}>{fixedLabel}</label>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_YEARS}
          max={MAX_YEARS}
          step={1}
          value={draft ?? years}
          aria-label={yearsLabel}
          aria-invalid={invalid || undefined}
          onFocus={() => onTypeChange("fixed")}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = parseYears(e.target.value);
            if (parsed !== null) onYearsChange(parsed);
          }}
          onBlur={() => setDraft(null)}
          className={`${inputClass} w-20`}
        />
        <span aria-hidden="true">year(s)</span>
      </div>
      {invalid && (
        <p className="text-xs text-red-700">
          Enter a whole number from {MIN_YEARS} to {MAX_YEARS}.
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          id={`${id}-open`}
          type="radio"
          name={name}
          checked={type === "open"}
          onChange={() => onTypeChange("open")}
          className="accent-brand"
        />
        <label htmlFor={`${id}-open`}>{openLabel}</label>
      </div>
    </div>
  );
}

const PARTY_FIELDS: { key: keyof Party; label: string; placeholder: string }[] = [
  { key: "company", label: "Company", placeholder: "Acme, Inc." },
  { key: "printName", label: "Signer name", placeholder: "Jane Doe" },
  { key: "title", label: "Title", placeholder: "CEO" },
  {
    key: "noticeAddress",
    label: "Notice address",
    placeholder: "legal@acme.com or postal address",
  },
];

export default function NdaForm({ data, onChange }: NdaFormProps) {
  const update = <K extends keyof NdaData>(key: K, value: NdaData[K]) =>
    onChange({ ...data, [key]: value });

  const updateParty = (index: 0 | 1, key: keyof Party, value: string) => {
    const parties = [...data.parties] as NdaData["parties"];
    parties[index] = { ...parties[index], [key]: value };
    update("parties", parties);
  };

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <Fieldset legend="Agreement terms">
        <Field label="Purpose" hint={COVER_HINTS.purpose}>
          <textarea
            rows={3}
            value={data.purpose}
            onChange={(e) => update("purpose", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Effective date">
          <input
            type="date"
            min="1900-01-01"
            max="2999-12-31"
            value={data.effectiveDate}
            onChange={(e) => update("effectiveDate", e.target.value)}
            className={inputClass}
          />
        </Field>
        <FieldGroup label="MNDA term" hint={COVER_HINTS.mndaTerm}>
          <TermChoice
            name="mndaTerm"
            type={data.mndaTermType}
            years={data.mndaTermYears}
            fixedLabel="Expires after"
            yearsLabel="MNDA term in years"
            openLabel="Until terminated"
            onTypeChange={(t) => update("mndaTermType", t)}
            onYearsChange={(y) => update("mndaTermYears", y)}
          />
        </FieldGroup>
        <FieldGroup
          label="Term of confidentiality"
          hint={COVER_HINTS.confidentiality}
        >
          <TermChoice
            name="confidentialityTerm"
            type={data.confidentialityType}
            years={data.confidentialityYears}
            fixedLabel="Protected for"
            yearsLabel="Term of confidentiality in years"
            openLabel="In perpetuity"
            onTypeChange={(t) => update("confidentialityType", t)}
            onYearsChange={(y) => update("confidentialityYears", y)}
          />
        </FieldGroup>
        <Field label="Governing law" hint="State whose laws govern the MNDA">
          <input
            value={data.governingLaw}
            onChange={(e) => update("governingLaw", e.target.value)}
            placeholder="Delaware"
            className={inputClass}
          />
        </Field>
        <Field label="Jurisdiction" hint="City or county and state">
          <input
            value={data.jurisdiction}
            onChange={(e) => update("jurisdiction", e.target.value)}
            placeholder="New Castle, DE"
            className={inputClass}
          />
        </Field>
        <Field label="MNDA modifications" hint="Optional changes to the Standard Terms">
          <textarea
            rows={2}
            value={data.modifications}
            onChange={(e) => update("modifications", e.target.value)}
            placeholder="None"
            className={inputClass}
          />
        </Field>
      </Fieldset>

      {([0, 1] as const).map((index) => (
        <Fieldset key={index} legend={`Party ${index + 1}`}>
          {PARTY_FIELDS.map(({ key, label, placeholder }) => (
            <Field key={key} label={label}>
              <input
                value={data.parties[index][key]}
                onChange={(e) => updateParty(index, key, e.target.value)}
                placeholder={placeholder}
                className={inputClass}
              />
            </Field>
          ))}
        </Fieldset>
      ))}
    </form>
  );
}
