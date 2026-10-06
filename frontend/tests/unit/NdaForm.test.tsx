import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import NdaForm from "@/components/NdaForm";
import { defaultNdaData, type NdaData } from "@/lib/nda";

/** Renders the form with real state, exposing the latest data for assertions. */
function renderForm(initial: NdaData = defaultNdaData()) {
  const onChange = vi.fn<(data: NdaData) => void>();
  function Harness() {
    const [data, setData] = useState(initial);
    return (
      <NdaForm
        data={data}
        onChange={(next) => {
          setData(next);
          onChange(next);
        }}
      />
    );
  }
  render(<Harness />);
  const latest = () => onChange.mock.lastCall?.[0] ?? initial;
  return { user: userEvent.setup(), onChange, latest };
}

const party = (n: 1 | 2) => within(screen.getByRole("group", { name: `Party ${n}` }));
const mndaTerm = () => within(screen.getByRole("radiogroup", { name: "MNDA term" }));
const confidentiality = () =>
  within(screen.getByRole("radiogroup", { name: "Term of confidentiality" }));

describe("NdaForm", () => {
  describe("rendering", () => {
    it("labels every agreement field", () => {
      renderForm();
      for (const label of [
        /^Purpose/,
        /^Effective date/,
        /^Governing law/,
        /^Jurisdiction/,
        /^MNDA modifications/,
        "MNDA term in years",
        "Term of confidentiality in years",
      ]) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
    });

    it("labels every party field, once per party", () => {
      renderForm();
      for (const n of [1, 2] as const) {
        for (const label of [/^Company/, /^Signer name/, /^Title/, /^Notice address/]) {
          expect(party(n).getByLabelText(label)).toBeInTheDocument();
        }
      }
    });

    it("shows the template's helper hints", () => {
      renderForm();
      expect(screen.getByText("How Confidential Information may be used")).toBeInTheDocument();
      expect(screen.getByText("The length of this MNDA")).toBeInTheDocument();
      expect(screen.getByText("How long Confidential Information is protected")).toBeInTheDocument();
    });

    it("shows the current values", () => {
      renderForm({ ...defaultNdaData(), governingLaw: "Texas", effectiveDate: "2026-03-04" });
      expect(screen.getByLabelText(/^Governing law/)).toHaveValue("Texas");
      expect(screen.getByLabelText(/^Effective date/)).toHaveValue("2026-03-04");
      expect(screen.getByLabelText(/^Purpose/)).toHaveValue(defaultNdaData().purpose);
      expect(screen.getByLabelText("MNDA term in years")).toHaveValue(1);
    });

    it("selects the fixed-term radios by default", () => {
      renderForm();
      expect(mndaTerm().getByLabelText("Expires after")).toBeChecked();
      expect(mndaTerm().getByLabelText("Until terminated")).not.toBeChecked();
      expect(confidentiality().getByLabelText("Protected for")).toBeChecked();
      expect(confidentiality().getByLabelText("In perpetuity")).not.toBeChecked();
    });
  });

  describe("text fields", () => {
    it.each([
      [/^Purpose/, "purpose", "Evaluating an acquisition."],
      [/^Governing law/, "governingLaw", "California"],
      [/^Jurisdiction/, "jurisdiction", "San Francisco, CA"],
      [/^MNDA modifications/, "modifications", "None beyond the Standard Terms."],
    ] as const)("updates %s", async (label, key, value) => {
      const { user, latest } = renderForm();
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
      expect(latest()[key]).toBe(value);
      expect(input).toHaveValue(value);
    });

    it("updates the effective date", () => {
      const { latest } = renderForm();
      fireEvent.change(screen.getByLabelText(/^Effective date/), {
        target: { value: "2027-01-15" },
      });
      expect(latest().effectiveDate).toBe("2027-01-15");
    });

    it("allows clearing the effective date", () => {
      const { latest } = renderForm({ ...defaultNdaData(), effectiveDate: "2026-03-04" });
      fireEvent.change(screen.getByLabelText(/^Effective date/), { target: { value: "" } });
      expect(latest().effectiveDate).toBe("");
    });

    it("keeps other fields unchanged when one field is edited", async () => {
      const initial = { ...defaultNdaData(), governingLaw: "Texas" };
      const { user, latest } = renderForm(initial);
      await user.type(screen.getByLabelText(/^Jurisdiction/), "Austin, TX");
      expect(latest()).toEqual({ ...initial, jurisdiction: "Austin, TX" });
    });
  });

  describe("party fields", () => {
    it("updates only the edited party", async () => {
      const { user, latest } = renderForm();
      await user.type(party(1).getByLabelText(/^Company/), "Acme, Inc.");
      await user.type(party(2).getByLabelText(/^Signer name/), "John Roe");
      await user.type(party(2).getByLabelText(/^Notice address/), "legal@globex.com");
      const [p1, p2] = latest().parties;
      expect(p1).toEqual({ printName: "", title: "", company: "Acme, Inc.", noticeAddress: "" });
      expect(p2).toEqual({
        printName: "John Roe",
        title: "",
        company: "",
        noticeAddress: "legal@globex.com",
      });
    });

    it("does not mutate the previous data object", async () => {
      const initial = defaultNdaData();
      const { user } = renderForm(initial);
      await user.type(party(1).getByLabelText(/^Title/), "CEO");
      expect(initial.parties[0].title).toBe("");
    });
  });

  describe("term choices", () => {
    it("switches the MNDA term to open-ended and back", async () => {
      const { user, latest } = renderForm();
      await user.click(mndaTerm().getByLabelText("Until terminated"));
      expect(latest().mndaTermType).toBe("open");
      expect(mndaTerm().getByLabelText("Until terminated")).toBeChecked();
      await user.click(mndaTerm().getByLabelText("Expires after"));
      expect(latest().mndaTermType).toBe("fixed");
    });

    it("switches confidentiality to perpetual without touching the MNDA term", async () => {
      const { user, latest } = renderForm();
      await user.click(confidentiality().getByLabelText("In perpetuity"));
      expect(latest().confidentialityType).toBe("open");
      expect(latest().mndaTermType).toBe("fixed");
    });

    it("selects the fixed option when the years box is focused", async () => {
      const { user, latest } = renderForm({ ...defaultNdaData(), mndaTermType: "open" });
      await user.click(screen.getByLabelText("MNDA term in years"));
      expect(latest().mndaTermType).toBe("fixed");
    });

    it("keeps the years box editable while the open-ended option is selected", () => {
      renderForm({ ...defaultNdaData(), confidentialityType: "open" });
      expect(screen.getByLabelText("Term of confidentiality in years")).toBeEnabled();
    });
  });

  describe("years input", () => {
    const years = () => screen.getByLabelText("MNDA term in years");

    it("lets the user clear the box and type a new number (no snapping to 1)", async () => {
      const { user, latest } = renderForm();
      await user.clear(years());
      expect(years()).toHaveValue(null);
      await user.type(years(), "5");
      expect(years()).toHaveValue(5);
      expect(latest().mndaTermYears).toBe(5);
    });

    it("commits multi-digit values", async () => {
      const { user, latest } = renderForm();
      await user.clear(years());
      await user.type(years(), "12");
      expect(latest().mndaTermYears).toBe(12);
    });

    it("rejects values above the maximum and keeps the last valid one", async () => {
      const { user, latest } = renderForm();
      await user.clear(years());
      await user.type(years(), "500");
      expect(latest().mndaTermYears).toBe(50);
      expect(years()).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Enter a whole number from 1 to 99.")).toBeInTheDocument();
    });

    it.each(["0", "2.5", "-3"])("flags %j as invalid without committing it", (value) => {
      const { latest } = renderForm();
      fireEvent.change(years(), { target: { value } });
      expect(latest().mndaTermYears).toBe(1);
      expect(years()).toHaveAttribute("aria-invalid", "true");
    });

    it("restores the last valid value on blur", async () => {
      const { user, latest } = renderForm();
      await user.clear(years());
      await user.tab();
      expect(years()).toHaveValue(1);
      expect(years()).not.toHaveAttribute("aria-invalid");
      expect(screen.queryByText(/Enter a whole number/)).not.toBeInTheDocument();
      expect(latest().mndaTermYears).toBe(1);
    });

    it("updates confidentiality years independently", async () => {
      const { user, latest } = renderForm();
      const box = screen.getByLabelText("Term of confidentiality in years");
      await user.clear(box);
      await user.type(box, "7");
      expect(latest().confidentialityYears).toBe(7);
      expect(latest().mndaTermYears).toBe(1);
    });
  });

  describe("form behavior", () => {
    it("does not submit (pressing Enter must not reload the page)", () => {
      renderForm();
      const form = screen.getByLabelText(/^Governing law/).closest("form")!;
      expect(fireEvent.submit(form)).toBe(false); // false = default prevented
    });

    it("is fully keyboard reachable in a sensible order", async () => {
      const { user } = renderForm();
      await user.tab();
      expect(screen.getByLabelText(/^Purpose/)).toHaveFocus();
      await user.tab();
      expect(screen.getByLabelText(/^Effective date/)).toHaveFocus();
      await user.tab();
      expect(mndaTerm().getByLabelText("Expires after")).toHaveFocus();
    });
  });
});
