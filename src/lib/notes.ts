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
