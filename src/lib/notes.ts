// Notes are stored either as legacy plain text, or as rich-text HTML prefixed
// with this marker. The marker lets us tell them apart so old notes containing
// code (with literal < >) are never mis-parsed as HTML.
export const RICH_PREFIX = "<!--rt1-->";

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert a stored note to display HTML: rich notes pass through (minus the
// marker); legacy plain text is escaped with newlines turned into <br>.
export function noteToHtml(value: string) {
  if (value.startsWith(RICH_PREFIX)) {
    return value.slice(RICH_PREFIX.length);
  }
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

// Flatten a stored note to plain text (the Monaco editors' format). Legacy
// rich-text notes keep their text and line breaks; styling is dropped.
export function noteToPlainText(value: string) {
  if (!value.startsWith(RICH_PREFIX)) {
    return value;
  }
  const text = value
    .slice(RICH_PREFIX.length)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "")
    .replace(/<(div|p)(\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
  return text.startsWith("\n") ? text.slice(1) : text;
}
