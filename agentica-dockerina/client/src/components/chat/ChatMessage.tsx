import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { markdownComponents } from "./MarkdownComponents";
import { TypingIndicator } from "./TypingIndicator";
import { useMemo, useState } from "react";

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
}

interface ChatMessageProps {
  message: Message;
  isLatestAssistant?: boolean;
}

export function ChatMessage({ message, isLatestAssistant = false }: ChatMessageProps) {
  const isUser = message.role === "user";

  const isThinking = (input: string | null | undefined) => {
    if (!input) return false;
    // Remove <think> blocks
    let withoutThink = input.replace(/<think>[\s\S]*?<\/think>/gi, "");

    // Remove markdown heading lines (e.g., ## SELECT AGENT) -> NO HEADING EXISTS NOW
    // withoutThink = withoutThink.replace(/^\s{0,3}#{1,6}\s+.*$/gm, "");

    // Remove whitespace
    return withoutThink.trim().length === 0;
  };

  const segments = useMemo(() => {
    if (!message.content) {
      return [] as Array<{ type: "markdown"; content: string } | { type: "think"; content: string }>;
    }

    const result: Array<{ type: "markdown"; content: string } | { type: "think"; content: string }> = [];
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = thinkRegex.exec(message.content)) !== null) {
      const preceding = message.content.slice(lastIndex, match.index);
      if (preceding) {
        result.push({ type: "markdown", content: preceding });
      }

      const inner = match[1].replace(/^\n+|\n+$/g, "");
      if (inner) {
        result.push({ type: "think", content: inner });
      }

      lastIndex = thinkRegex.lastIndex;
    }

    const remaining = message.content.slice(lastIndex);
    if (remaining) {
      result.push({ type: "markdown", content: remaining });
    }

    return result.length
      ? result
      : [{ type: "markdown", content: message.content }];
  }, [message.content]);

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
            const thinking = isThinking(message.content);
            return (
              <div className="prose prose-sm prose-invert max-w-none [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!bg-transparent">
                {segments.map((segment, index) => {
                  if (segment.type === "markdown") {
                    return (
                      <ReactMarkdown
                        key={`markdown-${index}`}
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={markdownComponents}
                      >
                        {parseAndFormatSpecialTags(segment.content)}
                      </ReactMarkdown>
                    );
                  }

                  return (
                    <ThinkBlock
                      key={`think-${index}`}
                      content={segment.content}
                    />
                  );
                })}
                {thinking && isLatestAssistant && <TypingIndicator className="mt-1" />}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

interface ThinkBlockProps {
  content: string;
}

function ThinkBlock({ content }: ThinkBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-1 mb-2 rounded-xl border border-zinc-700/40 bg-zinc-800/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span>{isOpen ? "Hide thinking" : "Show thinking"}</span>
        <span className={`transform transition-transform ${isOpen ? "rotate-90" : "rotate-0"}`} aria-hidden="true">
          {">"}
        </span>
      </button>
      {isOpen && (
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
