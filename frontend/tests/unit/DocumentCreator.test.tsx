import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentCreator from "@/components/DocumentCreator";
import type { CreatorDocument } from "@/lib/catalog";
import {
  defaultDocumentData,
  emptyDocumentData,
  type DocumentData,
  type FieldValue,
  type Party,
} from "@/lib/document";
import { creatorDocuments, definition, mockChatApi, NDA, type ChatRequestBody } from "../fixtures";

// The real PDF pipeline is covered by DocumentPdf.test.tsx and the e2e tests;
// here we only verify how DocumentCreator drives it.
const toBlob = vi.fn<() => Promise<Blob>>();
type PdfElement = ReactElement<{ document: CreatorDocument; data: DocumentData }>;
const pdf = vi.fn<(element: PdfElement) => { toBlob: typeof toBlob }>(() => ({ toBlob }));
vi.mock("@react-pdf/renderer", () => ({ pdf }));
vi.mock("@/components/DocumentPdf", () => ({ default: () => null }));

let documents: CreatorDocument[];
beforeAll(async () => {
  documents = await creatorDocuments();
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

const GREETING = "Hi! Let's get started.";
const REPLY = "Thanks, I've updated the document.";

/** What the assistant does to the document on its next reply. */
let assistantChange: (data: DocumentData) => DocumentData;
let chatRequests: ChatRequestBody[];

beforeEach(() => {
  assistantChange = (data) => data;
  chatRequests = mockChatApi(({ messages, data }) =>
    messages.length === 0 ? { reply: GREETING, data } : { reply: REPLY, data: assistantChange(data) },
  );
});

const renderCreator = async (initialDocumentId: string | null = "mutual-nda") => {
  render(<DocumentCreator documents={documents} initialDocumentId={initialDocumentId} />);
  await screen.findByText(GREETING);
  return userEvent.setup();
};

/** Sends a chat message and waits for the assistant's reply. */
const say = async (user: ReturnType<typeof userEvent.setup>, change: typeof assistantChange) => {
  assistantChange = change;
  const replies = screen.queryAllByText(REPLY).length;
  await user.type(screen.getByRole("textbox", { name: "Message the assistant" }), "Here you go{Enter}");
  await waitFor(() => expect(screen.getAllByText(REPLY)).toHaveLength(replies + 1));
};

/** An assistant change setting fields (and optionally parties). */
const setFields =
  (fields: Record<string, FieldValue>, parties?: [Party, Party]) =>
  (data: DocumentData): DocumentData => ({
    ...data,
    fields: { ...data.fields, ...fields },
    parties: parties ?? data.parties,
  });

const withCompanies = (a: string, b: string): [Party, Party] => {
  const [p1, p2] = defaultDocumentData(NDA).parties;
  return [
    { ...p1, company: a },
    { ...p2, company: b },
  ];
};

const preview = () => within(screen.getByRole("region", { name: "Document preview" }));
const downloadButton = () => screen.getByRole("button", { name: /PDF/ });
const lastPdfProps = () => pdf.mock.lastCall![0].props;
const pageTitle = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("DocumentCreator", () => {
  describe("layout", () => {
    it("has a single page title, naming the document", async () => {
      await renderCreator();
      expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
        "Mutual Non-Disclosure Agreement",
      ]);
    });

    it("shows the chat and the live preview", async () => {
      await renderCreator();
      expect(screen.getByRole("log", { name: "Conversation with the assistant" })).toBeInTheDocument();
      expect(preview().getByRole("heading", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    });

    it("links back to the document list", async () => {
      await renderCreator();
      expect(screen.getByRole("link", { name: "Back to all documents" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/app\/?$/), // see AppHeader.test
      );
    });

    it("keeps an empty status region mounted for screen readers", async () => {
      await renderCreator();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  describe("chat and live preview", () => {
    it("starts the chat with the preselected document's defaults", async () => {
      await renderCreator("cloud-service-agreement");
      expect(chatRequests).toEqual([
        {
          messages: [],
          data: defaultDocumentData(definition("cloud-service-agreement")),
          today: "2026-10-05",
        },
      ]);
      expect(pageTitle()).toBe("Cloud Service Agreement");
      expect(preview().getByRole("columnheader", { name: "PROVIDER" })).toBeInTheDocument();
    });

    it("updates the preview from the assistant's replies", async () => {
      const user = await renderCreator();
      await say(user, setFields({ governingLaw: "Delaware", mndaTermType: "open" }));
      expect(preview().getByText("Governing Law: Delaware")).toBeInTheDocument();
      expect(preview().getByText(/Continues until terminated/).closest("li")).toHaveTextContent("☒");
    });

    it("shows party details in the signature table", async () => {
      const user = await renderCreator();
      await say(user, setFields({}, withCompanies("Acme, Inc.", "")));
      const row = preview().getByRole("rowheader", { name: "Company" }).closest("tr")!;
      expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Acme, Inc.");
    });

    it("sends the updated document with the next message", async () => {
      const user = await renderCreator();
      await say(user, setFields({ governingLaw: "Delaware" }));
      await say(user, (data) => data);
      expect(chatRequests.at(-1)!.data.fields.governingLaw).toBe("Delaware");
    });
  });

  describe("choosing a document in the chat", () => {
    it("starts without a document when none is preselected", async () => {
      await renderCreator(null);
      expect(chatRequests[0].data).toEqual(emptyDocumentData());
      expect(pageTitle()).toBe("New Document");
      expect(preview().getByRole("heading", { name: "No document chosen yet" })).toBeInTheDocument();
      expect(preview().getByRole("link", { name: "choose one from the documents list" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/app\/?$/),
      );
      expect(screen.queryByRole("button", { name: /PDF/ })).not.toBeInTheDocument();
    });

    it("ignores an unknown preselected document", async () => {
      await renderCreator("residential-lease");
      expect(chatRequests[0].data).toEqual(emptyDocumentData());
    });

    it("shows the document the assistant picks", async () => {
      const user = await renderCreator(null);
      await say(user, () => defaultDocumentData(definition("pilot-agreement")));
      expect(pageTitle()).toBe("Pilot Agreement");
      expect(preview().getByRole("heading", { level: 2, name: "Pilot Agreement" })).toBeInTheDocument();
      expect(downloadButton()).toBeEnabled();
      expect(chatRequests).toHaveLength(2);
    });

    it("follows the assistant when it switches documents", async () => {
      const user = await renderCreator();
      await say(user, () => defaultDocumentData(definition("ai-addendum")));
      expect(pageTitle()).toBe("AI Addendum");
      expect(preview().getByRole("heading", { level: 3, name: "Training Data" })).toBeInTheDocument();
      expect(preview().queryByRole("heading", { level: 3, name: "MNDA Term" })).not.toBeInTheDocument();
    });
  });

  describe("dates", () => {
    it("default to today in the user's time zone", async () => {
      await renderCreator();
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("are sent to the assistant as unset rather than as today", async () => {
      const user = await renderCreator();
      await say(user, setFields({ jurisdiction: "Austin, TX" }));
      expect(chatRequests.at(-1)!.data.fields.effectiveDate).toBe("");
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("use the date the assistant sets", async () => {
      const user = await renderCreator();
      await say(user, setFields({ effectiveDate: "2027-01-15" }));
      expect(preview().getByText("January 15, 2027")).toBeInTheDocument();
    });

    it("go back to today if the assistant clears them", async () => {
      const user = await renderCreator();
      await say(user, setFields({ effectiveDate: "2027-01-15" }));
      await say(user, setFields({ effectiveDate: "" }));
      expect(preview().getByText("October 5, 2026")).toBeInTheDocument();
    });

    it("fill every date field of other documents", async () => {
      await renderCreator("cloud-service-agreement");
      const dates = ["Effective Date", "Order Date"].map(
        (heading) => preview().getByRole("heading", { level: 3, name: heading }).closest("section")!,
      );
      for (const section of dates) expect(section).toHaveTextContent("October 5, 2026");
    });
  });

  describe("PDF download", () => {
    it("generates the PDF from the current document and downloads it", async () => {
      const user = await renderCreator();
      await say(user, setFields({ governingLaw: "Delaware" }, withCompanies("Acme, Inc.", "Globex LLC")));

      await user.click(downloadButton());

      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(pdf).toHaveBeenCalledTimes(1);
      expect(lastPdfProps().document.definition.id).toBe("mutual-nda");
      expect(lastPdfProps().data).toMatchObject({
        fields: { governingLaw: "Delaware", effectiveDate: "2026-10-05" },
        parties: [{ company: "Acme, Inc." }, { company: "Globex LLC" }],
      });
      expect(createObjectURL).toHaveBeenCalledWith(await toBlob.mock.results[0].value);
      expect(clicked[0]).toEqual({
        href: "blob:mock-url",
        download: "Mutual-NDA-Acme-Inc-Globex-LLC.pdf",
      });
    });

    it("downloads the document the assistant switched to", async () => {
      const user = await renderCreator();
      await say(user, () => ({
        ...defaultDocumentData(definition("cloud-service-agreement")),
        parties: withCompanies("Acme", "Globex"),
      }));
      await user.click(downloadButton());
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(lastPdfProps().document.definition.id).toBe("cloud-service-agreement");
      expect(clicked[0].download).toBe("Cloud-Service-Agreement-Acme-Globex.pdf");
    });

    it("uses the assistant-set date in the PDF", async () => {
      const user = await renderCreator();
      await say(user, setFields({ effectiveDate: "2027-01-15" }));
      await user.click(downloadButton());
      await waitFor(() => expect(pdf).toHaveBeenCalled());
      expect(lastPdfProps().data.fields.effectiveDate).toBe("2027-01-15");
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
      expect(await screen.findByRole("status")).toHaveTextContent("Couldn't create the PDF. Please try again.");
      expect(downloadButton()).toBeEnabled();
      expect(clicked).toHaveLength(0);
      expect(consoleError).toHaveBeenCalledWith("Failed to generate PDF", expect.any(Error));

      await user.click(downloadButton());
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });
});
