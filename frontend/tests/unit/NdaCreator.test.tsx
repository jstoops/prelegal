import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import NdaCreator from "@/components/NdaCreator";
import { defaultNdaData, type NdaData } from "@/lib/nda";
import { loadNdaTemplate, type NdaTemplate } from "@/lib/nda-template";
import { mockChatApi, TEMPLATES_DIR, type ChatRequestBody } from "../fixtures";

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

/** The assistant greets, then applies `data` (merged onto the request's NDA) on each turn. */
let assistantUpdates: Partial<NdaData>;
let chatRequests: ChatRequestBody[];

const renderCreator = async () => {
  render(<NdaCreator template={template} />);
  await screen.findByText(GREETING);
  return userEvent.setup();
};

/** Sends a chat message and waits for the assistant's reply. */
const say = async (user: ReturnType<typeof userEvent.setup>, updates: Partial<NdaData>) => {
  assistantUpdates = updates;
  const replies = screen.queryAllByText(REPLY).length;
  await user.type(screen.getByRole("textbox", { name: "Message the assistant" }), "Here you go{Enter}");
  await waitFor(() => expect(screen.getAllByText(REPLY)).toHaveLength(replies + 1));
};

const preview = () => within(screen.getByRole("region", { name: "NDA preview" }));
const downloadButton = () => screen.getByRole("button", { name: /PDF/ });
const lastPdfData = () => pdf.mock.lastCall![0].props.data;

const GREETING = "Hi! Who are the two parties?";
const REPLY = "Thanks, I've updated the NDA.";

beforeEach(() => {
  assistantUpdates = {};
  chatRequests = mockChatApi(({ messages, data }) =>
    messages.length === 0
      ? { reply: GREETING, data }
      : { reply: REPLY, data: { ...data, ...assistantUpdates } },
  );
});

describe("NdaCreator", () => {
  describe("layout", () => {
    it("has a single page title", async () => {
      await renderCreator();
      expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
        "Mutual NDA Creator",
      ]);
    });

    it("shows the chat and the live preview", async () => {
      await renderCreator();
      expect(screen.getByRole("log", { name: "Conversation with the assistant" })).toBeInTheDocument();
      expect(preview().getByRole("heading", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    });

    it("keeps an empty status region mounted for screen readers", async () => {
      await renderCreator();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  describe("chat and live preview", () => {
    it("starts the chat with the default NDA", async () => {
      await renderCreator();
      expect(chatRequests).toEqual([
        { messages: [], data: defaultNdaData(), today: "2026-10-05" },
      ]);
    });

    it("updates the preview from the assistant's replies", async () => {
      const user = await renderCreator();
      await say(user, { governingLaw: "Delaware", mndaTermType: "open" });
      expect(preview().getByText("Governing Law: Delaware")).toBeInTheDocument();
      expect(preview().getByText(/Continues until terminated/).closest("li")).toHaveTextContent("☒");
    });

    it("shows party details in the signature table", async () => {
      const user = await renderCreator();
      const [party1, party2] = defaultNdaData().parties;
      await say(user, { parties: [{ ...party1, company: "Acme, Inc." }, party2] });
      const row = preview().getByRole("rowheader", { name: "Company" }).closest("tr")!;
      expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Acme, Inc.");
    });

    it("sends the updated NDA with the next message", async () => {
      const user = await renderCreator();
      await say(user, { governingLaw: "Delaware" });
      await say(user, {});
      expect(chatRequests.at(-1)!.data.governingLaw).toBe("Delaware");
    });
  });

  describe("effective date", () => {
    it("defaults to today in the user's time zone", async () => {
      await renderCreator();
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("tells the assistant the date is unset rather than sending today", async () => {
      const user = await renderCreator();
      await say(user, { jurisdiction: "Austin, TX" });
      expect(chatRequests.at(-1)!.data.effectiveDate).toBe("");
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("uses the date the assistant sets", async () => {
      const user = await renderCreator();
      await say(user, { effectiveDate: "2027-01-15" });
      expect(preview().getByText("January 15, 2027")).toBeInTheDocument();
    });

    it("goes back to today if the assistant clears the date", async () => {
      const user = await renderCreator();
      await say(user, { effectiveDate: "2027-01-15" });
      await say(user, { effectiveDate: "" });
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });
  });

  describe("PDF download", () => {
    it("generates the PDF from the current NDA and downloads it", async () => {
      const user = await renderCreator();
      const [party1, party2] = defaultNdaData().parties;
      await say(user, {
        governingLaw: "Delaware",
        parties: [
          { ...party1, company: "Acme, Inc." },
          { ...party2, company: "Globex LLC" },
        ],
      });

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
      const user = await renderCreator();
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(pdf.mock.lastCall![0].props).toMatchObject({ template });
    });

    it("uses the assistant-set date in the PDF", async () => {
      const user = await renderCreator();
      await say(user, { effectiveDate: "2027-01-15" });
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(lastPdfData().effectiveDate).toBe("2027-01-15");
    });

    it("shows progress and prevents double clicks while generating", async () => {
      let finish!: (blob: Blob) => void;
      toBlob.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const user = await renderCreator();
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
      const user = await renderCreator();
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
      const user = await renderCreator();

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
