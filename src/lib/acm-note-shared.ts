// Client-safe pieces of the ACM notes feature: no Prisma / server imports, so
// the workbench (a "use client" component) can use them without dragging the
// database client into the browser bundle.

export const ACM_NOTE_CATEGORIES = [
  "输入输出",
  "字符串",
  "排序比较",
  "容器",
  "踩坑",
  "题目笔记",
] as const;

export type AcmNoteCategory = (typeof ACM_NOTE_CATEGORIES)[number];

export function isAcmNoteCategory(value: unknown): value is AcmNoteCategory {
  return typeof value === "string" && (ACM_NOTE_CATEGORIES as readonly string[]).includes(value);
}

export const ACM_NOTE_TITLE_LIMIT = 120;
export const ACM_NOTE_CONTENT_LIMIT = 20000;

// Search + category filter for the notes list. The query matches title OR
// content (case-insensitive); an empty category means "all".
export function filterAcmNotes<T extends { title: string; content: string; category: string }>(
  notes: T[],
  query: string,
  category: string,
) {
  const q = query.trim().toLowerCase();
  return notes.filter((note) => {
    if (category && note.category !== category) {
      return false;
    }
    if (!q) {
      return true;
    }
    return note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q);
  });
}
