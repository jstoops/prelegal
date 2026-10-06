import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import NdaCreator from "@/components/NdaCreator";
import type { NdaData } from "@/lib/nda";
import { loadNdaTemplate, type NdaTemplate } from "@/lib/nda-template";
import type { PdfFont } from "@/lib/pdf-fonts";
import { FontLoadError } from "@/lib/pdf-fonts/errors";
import { TEMPLATES_DIR } from "../fixtures";

// The real PDF pipeline is covered by NdaPdfDocument.test.tsx and the e2e
// tests; here we only verify how NdaCreator drives it.
type PdfProps = { data: NdaData; fonts: string[] };
// vi.mock factories are hoisted above imports, so their mocks must be too.
const { toBlob, pdf, loadPdfFonts } = vi.hoisted(() => {
  const toBlob = vi.fn<() => Promise<Blob>>();
  return {
    toBlob,
    pdf: vi.fn<(element: ReactElement<PdfProps>) => { toBlob: typeof toBlob }>(() => ({ toBlob })),
    loadPdfFonts: vi.fn<(fonts: PdfFont[]) => Promise<string[]>>(),
  };
});
vi.mock("@react-pdf/renderer", () => ({ pdf }));
vi.mock("@/components/NdaPdfDocument", () => ({ default: () => null }));
// Real font planning; only downloading/registering fonts is stubbed.
vi.mock("@/lib/pdf-fonts/load", () => ({ loadPdfFonts }));

let template: NdaTemplate;
beforeAll(async () => {
  template = await loadNdaTemplate(TEMPLATES_DIR);
});

const createObjectURL = vi.fn(() => "blob:mock-url");
const revokeObjectURL = vi.fn();
let clicked: { href: string; download: string }[];

beforeEach(() => {
  // Only fake Date so "today" is stable; real timers keep async code working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5, 12, 0)); // Oct 5, 2026 local time
  toBlob.mockResolvedValue(new Blob(["%PDF-1.3"], { type: "application/pdf" }));
  pdf.mockClear();
  loadPdfFonts.mockReset().mockImplementation(async (fonts) => fonts.map((f) => f.family));
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderCreator = () => {
  render(<NdaCreator template={template} />);
  return userEvent.setup();
};

const dateInput = () => screen.getByLabelText(/^Effective date/);
const preview = () => within(screen.getByRole("region", { name: "NDA preview" }));
const downloadButton = () => screen.getByRole("button", { name: /PDF/ });
const lastPdfData = () => pdf.mock.lastCall![0].props.data;
const lastPdfFonts = () => pdf.mock.lastCall![0].props.fonts;
const party = (n: 1 | 2) => within(screen.getByRole("group", { name: `Party ${n}` }));

describe("NdaCreator", () => {
  describe("layout", () => {
    it("has a single page title", () => {
      renderCreator();
      expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
        "Mutual NDA Creator",
      ]);
    });

    it("shows the form and the live preview", () => {
      renderCreator();
      expect(screen.getByLabelText(/^Purpose/)).toBeInTheDocument();
      expect(preview().getByRole("heading", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    });

    it("keeps an empty status region mounted for screen readers", () => {
      renderCreator();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  describe("live preview", () => {
    it("updates the preview as the user types", async () => {
      const user = renderCreator();
      await user.type(screen.getByLabelText(/^Governing law/), "Delaware");
      expect(preview().getByText("Governing Law: Delaware")).toBeInTheDocument();
      await user.click(screen.getByLabelText("Until terminated"));
      expect(preview().getByText(/Continues until terminated/).closest("li")).toHaveTextContent("☒");
    });

    it("shows party details in the signature table", async () => {
      const user = renderCreator();
      const party1 = within(screen.getByRole("group", { name: "Party 1" }));
      await user.type(party1.getByLabelText(/^Company/), "Acme, Inc.");
      const row = preview().getByRole("rowheader", { name: "Company" }).closest("tr")!;
      expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Acme, Inc.");
    });
  });

  describe("effective date", () => {
    it("defaults to today in the user's time zone", () => {
      renderCreator();
      expect(dateInput()).toHaveValue("2026-10-05");
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("keeps defaulting to today while other fields are edited", async () => {
      const user = renderCreator();
      await user.type(screen.getByLabelText(/^Jurisdiction/), "Austin, TX");
      expect(dateInput()).toHaveValue("2026-10-05");
    });

    it("uses the date the user picks", () => {
      renderCreator();
      fireEvent.change(dateInput(), { target: { value: "2027-01-15" } });
      expect(dateInput()).toHaveValue("2027-01-15");
      expect(preview().getByText("January 15, 2027")).toBeInTheDocument();
    });

    it("lets the user clear the date without it snapping back to today", async () => {
      const user = renderCreator();
      fireEvent.change(dateInput(), { target: { value: "" } });
      expect(dateInput()).toHaveValue("");
      expect(preview().getByText("[Effective Date]")).toBeInTheDocument();
      // Editing something else must not bring the default back.
      await user.type(screen.getByLabelText(/^Jurisdiction/), "X");
      expect(dateInput()).toHaveValue("");
    });
  });

  describe("PDF download", () => {
    it("generates the PDF from the current form data and downloads it", async () => {
      const user = renderCreator();
      const party1 = within(screen.getByRole("group", { name: "Party 1" }));
      const party2 = within(screen.getByRole("group", { name: "Party 2" }));
      await user.type(party1.getByLabelText(/^Company/), "Acme, Inc.");
      await user.type(party2.getByLabelText(/^Company/), "Globex LLC");
      await user.type(screen.getByLabelText(/^Governing law/), "Delaware");

      await user.click(downloadButton());

      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(pdf).toHaveBeenCalledTimes(1);
      expect(lastPdfData()).toMatchObject({
        governingLaw: "Delaware",
        effectiveDate: "2026-10-05",
        parties: [{ company: "Acme, Inc." }, { company: "Globex LLC" }],
      });
      expect(createObjectURL).toHaveBeenCalledWith(await toBlob.mock.results[0].value);
      expect(clicked[0]).toEqual({
        href: "blob:mock-url",
        download: "Mutual-NDA-Acme-Inc-Globex-LLC.pdf",
      });
    });

    it("passes the template through to the PDF", async () => {
      const user = renderCreator();
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(pdf.mock.lastCall![0].props).toMatchObject({ template });
    });

    it("uses a user-chosen date in the PDF", async () => {
      const user = renderCreator();
      fireEvent.change(dateInput(), { target: { value: "2027-01-15" } });
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(lastPdfData().effectiveDate).toBe("2027-01-15");
    });

    it("shows progress and prevents double clicks while generating", async () => {
      let finish!: (blob: Blob) => void;
      toBlob.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const user = renderCreator();
      await user.click(downloadButton());

      expect(await screen.findByRole("button", { name: "Preparing PDF…" })).toBeDisabled();
      expect(downloadButton()).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Preparing PDF…");

      finish(new Blob(["%PDF"]));
      expect(await screen.findByRole("button", { name: "Download PDF" })).toBeEnabled();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(pdf).toHaveBeenCalledTimes(1);
    });

    it("revokes the object URL after the download starts", async () => {
      const user = renderCreator();
      await user.click(downloadButton());
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url"), {
        timeout: 2000,
      });
    });

    it("reports a failure and lets the user retry", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error("render failed"));
      const user = renderCreator();

      await user.click(downloadButton());
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Couldn't create the PDF. Please try again.",
      );
      expect(downloadButton()).toBeEnabled();
      expect(clicked).toHaveLength(0);
      expect(consoleError).toHaveBeenCalledWith("Failed to generate NDA PDF", expect.any(Error));

      await user.click(downloadButton());
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  describe("PDF fonts", () => {
    it("uses only the Noto Serif latin piece for Latin text", async () => {
      const user = renderCreator();
      await user.type(party(1).getByLabelText(/^Company/), "Müller GmbH");
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(lastPdfFonts()).toEqual(["noto-serif-latin"]);
    });

    it("adds the font pieces needed by what the user typed", async () => {
      const user = renderCreator();
      await user.type(party(1).getByLabelText(/^Company/), "株式会社さくら");
      await user.type(party(2).getByLabelText(/^Signer name/), "Иван Петров");
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      const fonts = lastPdfFonts();
      expect(fonts.slice(0, 2)).toEqual(["noto-serif-latin", "noto-serif-cyrillic"]);
      expect(fonts.slice(2).length).toBeGreaterThan(0);
      expect(fonts.slice(2).every((f) => f.startsWith("noto-sans-jp-"))).toBe(true);
    });

    it("loads the planned fonts before rendering, and renders with their stack", async () => {
      const user = renderCreator();
      await user.type(screen.getByLabelText(/^Governing law/), "Ζάκυνθος");
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      const loaded = loadPdfFonts.mock.lastCall![0];
      expect(loaded.map((f) => f.family)).toEqual(["noto-serif-latin", "noto-serif-greek"]);
      expect(lastPdfFonts()).toEqual(["noto-serif-latin", "noto-serif-greek"]);
      expect(loadPdfFonts.mock.invocationCallOrder[0]).toBeLessThan(pdf.mock.invocationCallOrder[0]);
    });

    it("turns tabs into spaces in the PDF only", async () => {
      renderCreator();
      fireEvent.change(screen.getByLabelText(/^Purpose/), {
        target: { value: "Joint\tventure\nPhase two" },
      });
      fireEvent.change(party(2).getByLabelText(/^Company/), { target: { value: "Globex\tLLC" } });
      await userEvent.setup().click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(lastPdfData().purpose).toBe("Joint venture\nPhase two");
      expect(lastPdfData().parties[1].company).toBe("Globex LLC");
      // The form keeps exactly what the user typed.
      expect(screen.getByLabelText(/^Purpose/)).toHaveValue("Joint\tventure\nPhase two");
    });

    it("explains a font download failure separately from other errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      loadPdfFonts.mockRejectedValueOnce(new FontLoadError("https://cdn/x.woff", new Error("offline")));
      const user = renderCreator();
      await user.click(downloadButton());
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Couldn't download the PDF fonts. Check your connection and try again.",
      );
      expect(pdf).not.toHaveBeenCalled();
      expect(downloadButton()).toBeEnabled();
    });
  });

  describe("unsupported characters warning", () => {
    const WARNING = /won't appear in the PDF/;
    const warning = () => screen.queryByText(WARNING);
    const findWarning = () => screen.findByText(WARNING);

    it("is hidden for supported scripts", async () => {
      const user = renderCreator();
      await user.type(party(1).getByLabelText(/^Company/), "Łukasz 株式会社 김민준 Έρευνα");
      // Give the (async) check time to run.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(warning()).not.toBeInTheDocument();
    });

    it("lists characters that won't appear in the PDF", async () => {
      const user = renderCreator();
      await user.type(party(1).getByLabelText(/^Company/), "Acme שלום");
      expect(await findWarning()).toHaveTextContent(
        "These characters won't appear in the PDF: ש ל ו ם.",
      );
      expect(warning()).toHaveTextContent(/Supported scripts are Latin, Cyrillic, Greek/);
    });

    it("is announced to screen readers (inside a live region)", async () => {
      const { container } = render(<NdaCreator template={template} />);
      const region = container.querySelector('[aria-live="polite"]');
      expect(region).toBeInTheDocument(); // mounted before any warning
      fireEvent.change(party(1).getByLabelText(/^Company/), { target: { value: "שלום" } });
      expect(region).toContainElement(await findWarning());
    });

    it("checks every free-text field", async () => {
      renderCreator();
      fireEvent.change(screen.getByLabelText(/^MNDA modifications/), { target: { value: "مرحبا" } });
      expect(await findWarning()).toHaveTextContent("م ر ح ب ا");
    });

    it("summarizes long lists", async () => {
      renderCreator();
      fireEvent.change(screen.getByLabelText(/^Purpose/), {
        target: { value: "אבגדהוזחטיכלמנסעפצקרשת" }, // 22 Hebrew letters
      });
      expect(await findWarning()).toHaveTextContent("א ב ג ד ה ו ז ח ט י כ ל and 10 more.");
    });

    it("disappears once the characters are removed", async () => {
      renderCreator();
      const company = party(1).getByLabelText(/^Company/);
      fireEvent.change(company, { target: { value: "שלום" } });
      expect(await findWarning()).toBeInTheDocument();
      fireEvent.change(company, { target: { value: "Acme" } });
      await waitFor(() => expect(warning()).not.toBeInTheDocument());
    });

    it("does not block the download", async () => {
      const user = renderCreator();
      await user.type(party(1).getByLabelText(/^Company/), "שלום");
      await findWarning();
      await user.click(downloadButton());
      await waitFor(() => expect(clicked).toHaveLength(1));
    });
  });
});
