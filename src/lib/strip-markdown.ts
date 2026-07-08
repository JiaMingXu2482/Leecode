// The plan-assistant chat panel renders plain text, and DeepSeek ignores a
// "no markdown" instruction often enough that stripping the common emphasis
// markers server-side is simpler than fighting the prompt.
export function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S(?:.*?\S)?)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "· ");
}
