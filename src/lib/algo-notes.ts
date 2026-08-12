import { getDb } from "@/lib/db";
import { extractProblemRefs } from "@/lib/markdown";

export type AlgoNoteSummary = {
  id: string;
  title: string;
  category: string;
  contentMarkdown: string;
  updatedAt: string;
};

const TITLE_LIMIT = 120;
const CATEGORY_LIMIT = 40;
const CONTENT_LIMIT = 200_000;

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

// 分类内按 sortOrder，再按更新时间。没填分类的归到「未分类」，排在最后。
export async function listAlgoNotes(): Promise<AlgoNoteSummary[]> {
  const rows = await getDb().algoNote.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    contentMarkdown: row.contentMarkdown,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createAlgoNote(input: {
  title?: unknown;
  category?: unknown;
  contentMarkdown?: unknown;
}) {
  const contentMarkdown = clean(input.contentMarkdown, CONTENT_LIMIT);
  const title = clean(input.title, TITLE_LIMIT) || "未命名笔记";
  return getDb().algoNote.create({
    data: {
      title,
      category: clean(input.category, CATEGORY_LIMIT),
      contentMarkdown,
      refs: extractProblemRefs(contentMarkdown).join(","),
    },
  });
}

export async function updateAlgoNote(
  id: string,
  input: { title?: unknown; category?: unknown; contentMarkdown?: unknown; sortOrder?: unknown },
) {
  const data: {
    title?: string;
    category?: string;
    contentMarkdown?: string;
    refs?: string;
    sortOrder?: number;
  } = {};
  if (input.title !== undefined) {
    data.title = clean(input.title, TITLE_LIMIT) || "未命名笔记";
  }
  if (input.category !== undefined) {
    data.category = clean(input.category, CATEGORY_LIMIT);
  }
  if (input.contentMarkdown !== undefined) {
    data.contentMarkdown = clean(input.contentMarkdown, CONTENT_LIMIT);
    // refs 是正文的派生数据，永远跟着正文一起更新。
    data.refs = extractProblemRefs(data.contentMarkdown).join(",");
  }
  if (typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)) {
    data.sortOrder = Math.trunc(input.sortOrder);
  }
  return getDb().algoNote.update({ where: { id }, data });
}

export async function deleteAlgoNote(id: string) {
  await getDb().algoNote.delete({ where: { id } });
}

// 题目详情页的「相关算法总结」：正文里引用过这道题号的笔记。
// refs 存成 ",53,198," 这种两头带逗号的形式没必要 —— 数量很小，直接在应用层过滤，
// 省得为 SQLite 的字符串匹配写易错的 LIKE 模式。
export async function algoNotesForProblem(frontendId: number) {
  const rows = await getDb().algoNote.findMany({
    select: { id: true, title: true, category: true, refs: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  const target = String(frontendId);
  return rows
    .filter((row) => row.refs.split(",").includes(target))
    .map(({ id, title, category }) => ({ id, title, category }));
}
