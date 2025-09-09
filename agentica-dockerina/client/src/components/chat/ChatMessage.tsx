import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { markdownComponents } from "./MarkdownComponents";
import { TypingIndicator } from "./TypingIndicator";

export function parseAndFormatSpecialTags(input: string | null | undefined): string {
  if (input == null) {
    // covers both null and undefined using == null idiom
    return "";
  }

  let output = input;

  // Convert <think> blocks to blockquotes
  output = output.replace(/<think>([\s\S]*?)<\/think>/gi, (_match: string, inner: string) => {
    const trimmed = inner.replace(/^\n+|\n+$/g, "");
    if (trimmed === "") {
      return "";
    }

    // explicit type so noImplicitAny error. split yields string[].
    const lines: string[] = trimmed.split(/\r?\n/);
    const quoted = lines
      .map((line: string): string => `> ${line}`)
      .join("\n");

    return `\n${quoted}\n`;
  });

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
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  const isThinking = (input: string | null | undefined) => {
    if (!input) return false;
    // Remove <think> blocks
    let withoutThink = input.replace(/<think>[\s\S]*?<\/think>/gi, "");
    // Remove markdown heading lines (e.g., ## SELECT AGENT)
    withoutThink = withoutThink.replace(/^\s{0,3}#{1,6}\s+.*$/gm, "");
    // Remove whitespace
    return withoutThink.trim().length === 0;
  };

  const extractFirstHeader = (input: string | null | undefined) => {
    if (!input) return null;
    const match = input.match(/^\s{0,3}(#{1,6})\s+(.+)$/m);
    return match ? `${match[1]} ${match[2].trim()}` : null;
  };

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
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {parseAndFormatSpecialTags(message.content)}
                </ReactMarkdown>
                {thinking && <TypingIndicator className="mt-1" />}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
