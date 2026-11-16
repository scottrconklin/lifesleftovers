/**
 * Set KEY=value lines in a .env file's text, keeping comments, order and every other line.
 * Keys that aren't there yet are appended. Returns the new text.
 */
export function setEnvValues(text: string, values: Record<string, string>): string {
  const remaining = new Map(Object.entries(values));
  const lines = text.split(/\r?\n/).map((line) => {
    const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    if (!key || !remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });
  if (remaining.size > 0) {
    if (lines.length > 0 && lines.at(-1) === "") lines.pop();
    for (const [key, value] of remaining) lines.push(`${key}=${value}`);
    lines.push("");
  }
  return lines.join("\n");
}
