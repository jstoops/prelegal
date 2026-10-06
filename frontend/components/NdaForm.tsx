"use client";

import { useId, type ReactNode } from "react";
import type { NdaData, Party, TermType } from "@/lib/nda";

interface NdaFormProps {
  data: NdaData;
  onChange: (data: NdaData) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

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
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
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
    <div role="group" aria-labelledby={id}>
      <span id={id} className="block text-sm font-medium text-slate-700">
        {label}
      </span>
      <span className="block text-xs text-slate-500">{hint}</span>
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

function TermChoice({
  name,
  type,
  years,
  fixedLabel,
  openLabel,
  onTypeChange,
  onYearsChange,
}: {
  name: string;
  type: TermType;
  years: number;
  fixedLabel: string;
  openLabel: string;
  onTypeChange: (type: TermType) => void;
  onYearsChange: (years: number) => void;
}) {
  return (
    <div className="space-y-2 text-sm text-slate-700">
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={type === "fixed"}
          onChange={() => onTypeChange("fixed")}
          className="accent-indigo-600"
        />
        <input
          type="number"
          min={1}
          max={99}
          value={years}
          disabled={type !== "fixed"}
          onChange={(e) => onYearsChange(Math.max(1, Number(e.target.value) || 1))}
          aria-label={`${fixedLabel} (years)`}
          className={`${inputClass} w-20 disabled:bg-slate-100 disabled:text-slate-400`}
        />
        <span>{fixedLabel}</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={type === "open"}
          onChange={() => onTypeChange("open")}
          className="accent-indigo-600"
        />
        <span>{openLabel}</span>
      </label>
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
        <Field label="Purpose" hint="How Confidential Information may be used">
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
            value={data.effectiveDate}
            onChange={(e) => update("effectiveDate", e.target.value)}
            className={inputClass}
          />
        </Field>
        <FieldGroup label="MNDA term" hint="The length of this MNDA">
          <TermChoice
            name="mndaTerm"
            type={data.mndaTermType}
            years={data.mndaTermYears}
            fixedLabel="year(s) from Effective Date"
            openLabel="Until terminated"
            onTypeChange={(t) => update("mndaTermType", t)}
            onYearsChange={(y) => update("mndaTermYears", y)}
          />
        </FieldGroup>
        <FieldGroup
          label="Term of confidentiality"
          hint="How long Confidential Information is protected"
        >
          <TermChoice
            name="confidentialityTerm"
            type={data.confidentialityType}
            years={data.confidentialityYears}
            fixedLabel="year(s) from Effective Date"
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
