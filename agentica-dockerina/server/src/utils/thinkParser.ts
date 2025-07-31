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