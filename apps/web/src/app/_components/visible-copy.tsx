export function visibleCopy(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\bdemo\b/gi, "")
    .replace(/데모/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
