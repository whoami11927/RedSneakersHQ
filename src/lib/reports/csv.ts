export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  const text = value ?? "";
  const safeText = /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
