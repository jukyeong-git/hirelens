export type PublicPostingTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parsePublicPostingText(value: string): PublicPostingTextBlock[] {
  const lines = value
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\n")
    .replace(/[ \t]+([•·])[ \t]+/gu, "\n$1 ")
    .replace(/[ \t]+-[ \t]+/gu, "\n- ")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: PublicPostingTextBlock[] = [];
  for (const line of lines) {
    const bullet = line.match(/^[-•·][ \t]*(.+)$/u);
    if (!bullet) {
      blocks.push({ type: "paragraph", text: line });
      continue;
    }

    const previous = blocks.at(-1);
    if (previous?.type === "list") {
      previous.items.push(bullet[1]!.trim());
    } else {
      blocks.push({ type: "list", items: [bullet[1]!.trim()] });
    }
  }
  return blocks;
}
