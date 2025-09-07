export interface RawToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Remove all <think>...</think> blocks
export function stripThink(text: string): string {
  return (text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Return concatenated think blocks for echoing
export function extractThinkBlocks(text: string): string {
  const raw = text ?? "";
  const blocks = Array.from(raw.matchAll(/<think>[\s\S]*?<\/think>/g)).map(m => m[0]);
  return blocks.join("\n").trim();
}

// Parse tool calls embedded in <tool_call>...</tool_call> tags within content
export function parseToolCallFromContent(content: string, opts?: { expectName?: string }): RawToolCall[] {
  const found: RawToolCall[] = [];
  if (typeof content !== "string" || content.indexOf("<tool_call>") === -1) return found;
  const matches = Array.from(content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g));
  for (const m of matches) {
    const json = m[1]?.trim();
    if (!json) continue;
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== "object") continue;
      if (typeof (obj as any).name !== "string" || typeof (obj as any).arguments !== "object") continue;
      const name = (obj as any).name as string;
      if (opts?.expectName && name !== opts.expectName) continue;
      found.push({ name, arguments: (obj as any).arguments as Record<string, unknown> });
    } catch { /* ignore parse errors */ }
  }
  return found;
}

// Parse a single raw JSON tool call after stripping <think> blocks.
// Attempts direct text, JSON code fence, or braces slice.
export function parseRawJsonAfterThink(content: string, opts?: { expectName?: string }): RawToolCall | null {
  if (typeof content !== "string") return null;
  const stripped = stripThink(content);
  if (!stripped) return null;

  const candidates: string[] = [];
  candidates.push(stripped);
  const fenceMatch = stripped.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  }

  for (const cand of candidates) {
    const t = (cand ?? "").trim();
    if (!t || !(t.startsWith("{") || t.startsWith("["))) continue;
    try {
      const obj = JSON.parse(t);
      if (!obj || typeof obj !== "object") continue;
      if (typeof (obj as any).name !== "string" || typeof (obj as any).arguments !== "object") continue;
      const name = (obj as any).name as string;
      if (opts?.expectName && name !== opts.expectName) continue;
      return { name, arguments: (obj as any).arguments as Record<string, unknown> };
    } catch { /* keep trying other candidates */ }
  }
  return null;
}

