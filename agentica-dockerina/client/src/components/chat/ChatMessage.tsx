import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { markdownComponents } from "./MarkdownComponents";
import { TypingIndicator } from "./TypingIndicator";
import { useState } from "react";

export function parseAndFormatSpecialTags(input: string | null | undefined): string {
  if (input == null) {
    // covers both null and undefined using == null idiom
    return "";
  }

  let output = input;

  // Convert <tldr> blocks to a labeled section
  output = output.replace(/<tldr>([\s\S]*?)<\/tldr>/gi, (_match: string, inner: string) => {
    const trimmed = inner.replace(/^\n+|\n+$/g, "");
    if (trimmed === "") {
      return "";
    }
    return `\n---\n\n**TL;DR:**\n${trimmed}\n\n`;
  });

  // Convert <question> blocks to a labeled section
  output = output.replace(/<question>([\s\S]*?)<\/question>/gi, (_match: string, inner: string) => {
    const trimmed = inner.replace(/^\n+|\n+$/g, "");
    if (trimmed === "") {
      return "";
    }
    return `\n---\n\n**follow-up:**\n${trimmed}\n\n`;
  });

  return output;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | undefined;
}

interface ChatMessageProps {
  message: Message;
  isLatestAssistant?: boolean;
}

export function ChatMessage({ message, isLatestAssistant = false }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser ? "bg-white text-zinc-900" : "bg-zinc-700/50 text-gray-100"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap break-all">
            {message.content}
          </p>
        ) : (
          (() => {
            const thinking =
              !message.content || message.content.trim().length === 0;
            return (
              <div className="prose prose-sm prose-invert max-w-none [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!bg-transparent">
                {message.reasoning && message.reasoning.trim().length > 0 && (
                  <ReasoningBlock content={message.reasoning} />
                )}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {parseAndFormatSpecialTags(message.content)}
                </ReactMarkdown>
                {thinking && isLatestAssistant && (
                  <TypingIndicator className="mt-1" />
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 rounded-xl border border-zinc-700/40 bg-zinc-800/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white"
        onClick={() => setOpen((v: boolean) => !v)}
        aria-expanded={open}
      >
        <span>{open ? "Hide reasoning" : "Show reasoning"}</span>
        <span className={`transform transition-transform ${open ? "rotate-90" : "rotate-0"}`} aria-hidden="true">
          {">"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-zinc-300">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {parseAndFormatSpecialTags(content)}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
