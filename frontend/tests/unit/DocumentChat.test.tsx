import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import DocumentChat from "@/components/DocumentChat";
import type { ChatMessage } from "@/lib/chat";
import { defaultDocumentData, emptyDocumentData } from "@/lib/document";
import { filledNdaData, mockChatApi, NDA, type ChatReply, type ChatRequestBody } from "../fixtures";

const defaultNdaData = () => defaultDocumentData(NDA);

const GREETING = "Hi! Who are the two parties?";

/** Greets on an empty history, then answers with `reply` and `data`. */
const greetThen =
  (reply = "Thanks, noted.", data = filledNdaData()) =>
  ({ messages }: ChatRequestBody): ChatReply =>
    messages.length === 0 ? { reply: GREETING, data: defaultNdaData() } : { reply, data };

const renderChat = (data = defaultNdaData()) => {
  const onDataChange = vi.fn();
  const view = render(<DocumentChat data={data} onDataChange={onDataChange} />);
  return { onDataChange, user: userEvent.setup(), ...view };
};

const log = () => within(screen.getByRole("log", { name: "Conversation with the assistant" }));
const messageBox = () => screen.getByRole("textbox", { name: "Message the assistant" });
const sendButton = () => screen.getByRole("button", { name: "Send" });

describe("DocumentChat", () => {
  it("asks the assistant for a greeting on load", async () => {
    const requests = mockChatApi(greetThen());
    const { onDataChange } = renderChat();

    expect(log().getByText("Assistant is typing…")).toBeInTheDocument();
    expect(await log().findByText(GREETING)).toBeInTheDocument();
    expect(log().queryByText("Assistant is typing…")).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ messages: [], data: defaultNdaData() });
    expect(onDataChange).toHaveBeenCalledWith(defaultNdaData());
  });

  it("greets only once in strict mode", async () => {
    const requests = mockChatApi(greetThen());
    render(
      <StrictMode>
        <DocumentChat data={defaultNdaData()} onDataChange={() => {}} />
      </StrictMode>,
    );
    expect(await log().findAllByText(GREETING)).toHaveLength(1);
    // The first mount's request is aborted, so only one greeting is shown.
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(log().getAllByText(GREETING)).toHaveLength(1);
  });

  it("sends the conversation and current document, then shows the reply", async () => {
    const requests = mockChatApi(greetThen("Got it: Acme and Globex."));
    const data = filledNdaData({ governingLaw: "" });
    const { user, onDataChange } = renderChat(data);
    await log().findByText(GREETING);

    await user.type(messageBox(), "Acme and Globex{Enter}");

    expect(log().getByText("Acme and Globex")).toBeInTheDocument();
    expect(messageBox()).toHaveValue("");
    expect(await log().findByText("Got it: Acme and Globex.")).toBeInTheDocument();
    expect(requests.at(-1)).toMatchObject({
      messages: [
        { role: "assistant", content: GREETING },
        { role: "user", content: "Acme and Globex" },
      ],
      data,
    });
    expect(onDataChange).toHaveBeenLastCalledWith(filledNdaData());
  });

  it("labels who said what for screen readers", async () => {
    mockChatApi(greetThen());
    const { user } = renderChat();
    await log().findByText(GREETING);
    await user.type(messageBox(), "Hello{Enter}");
    await log().findByText("Thanks, noted.");
    expect(log().getByText("Hello").parentElement).toHaveTextContent("You: Hello");
    expect(log().getByText(GREETING).parentElement).toHaveTextContent(`Assistant: ${GREETING}`);
  });

  it("uses Shift+Enter for new lines and the Send button to submit", async () => {
    const requests = mockChatApi(greetThen());
    const { user } = renderChat();
    await log().findByText(GREETING);

    await user.type(messageBox(), "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(messageBox()).toHaveValue("Line one\nLine two");
    expect(requests).toHaveLength(1);

    await user.click(sendButton());
    await log().findByText("Thanks, noted.");
    expect(requests.at(-1)!.messages.at(-1)).toEqual({
      role: "user",
      content: "Line one\nLine two",
    });
  });

  it("ignores blank messages", async () => {
    const requests = mockChatApi(greetThen());
    const { user } = renderChat();
    await log().findByText(GREETING);
    await user.type(messageBox(), "   {Enter}");
    expect(sendButton()).toBeDisabled();
    expect(requests).toHaveLength(1);
  });

  it("lets the user type but not send while waiting for a reply", async () => {
    let answer!: (result: ChatReply) => void;
    mockChatApi(({ messages }) =>
      messages.length === 0
        ? { reply: GREETING, data: defaultNdaData() }
        : new Promise<ChatReply>((resolve) => (answer = resolve)),
    );
    const { user } = renderChat();
    await log().findByText(GREETING);

    await user.type(messageBox(), "First{Enter}");
    await user.type(messageBox(), "Second");
    expect(sendButton()).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(messageBox()).toHaveValue("Second");

    answer({ reply: "Noted.", data: defaultNdaData() });
    await log().findByText("Noted.");
    expect(sendButton()).toBeEnabled();
  });

  it("shows errors and retries the same turn", async () => {
    let fail = true;
    const requests = mockChatApi((body) =>
      fail && body.messages.length > 0
        ? Response.json({ detail: "The AI assistant is unavailable. Please try again." }, { status: 502 })
        : greetThen()(body),
    );
    const { user, onDataChange } = renderChat();
    await log().findByText(GREETING);

    await user.type(messageBox(), "Acme and Globex{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The AI assistant is unavailable. Please try again.",
    );
    expect(log().getByText("Acme and Globex")).toBeInTheDocument();
    expect(onDataChange).toHaveBeenCalledTimes(1); // only the greeting

    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await log().findByText("Thanks, noted.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requests.at(-1)!.messages).toEqual(requests.at(-2)!.messages);
    expect(log().getAllByText("Acme and Globex")).toHaveLength(1);
  });

  it("can retry a failed greeting", async () => {
    let fail = true;
    mockChatApi((body) =>
      fail ? Response.json({ detail: "The AI assistant isn't configured." }, { status: 503 }) : greetThen()(body),
    );
    const { user } = renderChat();
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI assistant isn't configured.");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await log().findByText(GREETING)).toBeInTheDocument();
  });

  it("works before a document is chosen", async () => {
    const requests = mockChatApi(() => ({ reply: "What do you need?", data: emptyDocumentData() }));
    const { onDataChange } = renderChat(emptyDocumentData());
    expect(await log().findByText("What do you need?")).toBeInTheDocument();
    expect(requests[0].data).toEqual(emptyDocumentData());
    expect(onDataChange).toHaveBeenCalledWith(emptyDocumentData());
  });

  it("sends the latest document from the parent", async () => {
    const requests = mockChatApi(greetThen());
    const onDataChange = vi.fn();
    const { rerender } = render(<DocumentChat data={defaultNdaData()} onDataChange={onDataChange} />);
    await log().findByText(GREETING);

    const updated = filledNdaData();
    rerender(<DocumentChat data={updated} onDataChange={onDataChange} />);
    await userEvent.setup().type(messageBox(), "Next{Enter}");
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].data).toEqual(updated);
  });

  describe("saving", () => {
    const SAVED_HISTORY: ChatMessage[] = [
      { role: "assistant", content: "Hi! Who are the parties?" },
      { role: "user", content: "Acme and Globex" },
      { role: "assistant", content: "Got it. What's the purpose?" },
    ];

    it("sends the saved copy's id once a turn has saved the document", async () => {
      let turn = 0;
      const requests = mockChatApi((body) => {
        turn += 1;
        if (body.messages.length === 0) return { reply: GREETING, data: defaultNdaData() };
        return { reply: `Reply ${turn}`, data: defaultNdaData(), savedId: "draft-1" };
      });
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<DocumentChat data={defaultNdaData()} onDataChange={() => {}} onSaved={onSaved} />);
      await log().findByText(GREETING);

      await user.type(messageBox(), "First{Enter}");
      await log().findByText("Reply 2");
      await user.type(messageBox(), "Second{Enter}");
      await log().findByText("Reply 3");

      expect(requests.map((r) => r.savedId)).toEqual([null, null, "draft-1"]);
      expect(onSaved).toHaveBeenCalledWith("draft-1");
      expect(onSaved).toHaveBeenCalledTimes(2);
    });

    it("doesn't report a save when nothing was saved", async () => {
      mockChatApi(greetThen());
      const onSaved = vi.fn();
      render(<DocumentChat data={defaultNdaData()} onDataChange={() => {}} onSaved={onSaved} />);
      await log().findByText(GREETING);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("resumes a saved conversation without a new greeting", async () => {
      const requests = mockChatApi(() => ({ reply: "Noted.", data: filledNdaData(), savedId: "draft-1" }));
      const user = userEvent.setup();
      render(
        <DocumentChat
          data={defaultNdaData()}
          onDataChange={() => {}}
          resume={{ savedId: "draft-1", messages: SAVED_HISTORY }}
        />,
      );

      expect(log().getByText("Got it. What's the purpose?")).toBeInTheDocument();
      expect(log().queryByText("Assistant is typing…")).not.toBeInTheDocument();
      expect(sendButton()).toBeDisabled(); // only until something is typed
      expect(requests).toHaveLength(0);

      await user.type(messageBox(), "Hiring{Enter}");
      await log().findByText("Noted.");
      expect(requests).toEqual([
        expect.objectContaining({
          messages: [...SAVED_HISTORY, { role: "user", content: "Hiring" }],
          savedId: "draft-1",
        }),
      ]);
    });

    it("resumes only once in strict mode", async () => {
      const requests = mockChatApi(greetThen());
      render(
        <StrictMode>
          <DocumentChat
            data={defaultNdaData()}
            onDataChange={() => {}}
            resume={{ savedId: "draft-1", messages: SAVED_HISTORY }}
          />
        </StrictMode>,
      );
      expect(log().getAllByText("Acme and Globex")).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requests).toHaveLength(0);
    });
  });
});
