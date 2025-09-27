interface TypingIndicatorProps {
  className?: string;
  label?: string;
}

export function TypingIndicator({ className = "", label = "Assistant is typing" }: TypingIndicatorProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} aria-live="polite" aria-label={label}>
      <span
        className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-100/90 shadow-[0_0_6px_rgba(244,244,245,0.5)] animate-pulse"
        style={{ animationDelay: "0ms" }}
      ></span>
      <span
        className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(228,228,231,0.6)] animate-pulse"
        style={{ animationDelay: "200ms" }}
      ></span>
      <span
        className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-300 shadow-[0_0_10px_rgba(212,212,216,0.7)] animate-pulse"
        style={{ animationDelay: "400ms" }}
      ></span>
    </div>
  );
}
