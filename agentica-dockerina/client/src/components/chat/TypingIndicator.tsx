interface TypingIndicatorProps {
  className?: string;
  label?: string;
}

export function TypingIndicator({ className = "", label = "Assistant is typing" }: TypingIndicatorProps) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`} aria-live="polite" aria-label={label}>
      <span className="inline-block w-2 h-2 rounded-full bg-gray-300 opacity-60 animate-pulse" style={{ animationDelay: "0ms" }}></span>
      <span className="inline-block w-2 h-2 rounded-full bg-gray-300 opacity-60 animate-pulse" style={{ animationDelay: "200ms" }}></span>
      <span className="inline-block w-2 h-2 rounded-full bg-gray-300 opacity-60 animate-pulse" style={{ animationDelay: "400ms" }}></span>
    </div>
  );
}
