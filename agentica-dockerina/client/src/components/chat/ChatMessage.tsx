import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { markdownComponents } from "./MarkdownComponents";

export function parseThinkToBlockquote(input: string | null | undefined): string {
  if (input == null) {
    // covers both null and undefined using == null idiom
    return "";
  }

  return input.replace(/<think>([\s\S]*?)<\/think>/gi, (_match: string, inner: string) => {
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
          <div className="prose prose-sm prose-invert max-w-none [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!bg-transparent">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {parseThinkToBlockquote(message.content)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
