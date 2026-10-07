import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import NdaCreator from "@/components/NdaCreator";
import type { NdaData } from "@/lib/nda";
import { loadNdaTemplate, type NdaTemplate } from "@/lib/nda-template";
import { TEMPLATES_DIR } from "../fixtures";

// The real PDF pipeline is covered by NdaPdfDocument.test.tsx and the e2e
// tests; here we only verify how NdaCreator drives it.
const toBlob = vi.fn<() => Promise<Blob>>();
const pdf = vi.fn<(element: ReactElement<{ data: NdaData }>) => { toBlob: typeof toBlob }>(
  () => ({ toBlob }),
);
vi.mock("@react-pdf/renderer", () => ({ pdf }));
vi.mock("@/components/NdaPdfDocument", () => ({ default: () => null }));

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
});
