import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 笔记助手对用户的承诺是「只读」。这个承诺目前只靠「工具集里没有写工具」维持，
// 而工具集是人手维护的 —— 以后有人（包括我自己）顺手加一个能写库的工具，
// 承诺就悄悄破了。这里把它钉死：加了写工具、或数据层出现写操作，测试就红。

const ROUTE = join(process.cwd(), "src/app/api/note-assistant/route.ts");
const DATA = join(process.cwd(), "src/lib/note-assistant-data.ts");

// 允许出现在笔记助手里的工具，全部是读。加新工具要先想清楚再往这里加。
const ALLOWED_TOOLS = new Set([
  "get_recent_sessions",
  "get_topic_breakdown",
  "get_weak_problems",
  "get_problem_history",
  "list_algo_notes",
  "read_algo_note",
  "get_progress",
]);

// Prisma 的写方法。数据层出现任何一个都说明这个助手能改库了。
const WRITE_CALLS =
  /\.(create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe)\s*\(/;

describe("笔记助手必须是只读的", () => {
  const routeSource = readFileSync(ROUTE, "utf8");
  const dataSource = readFileSync(DATA, "utf8");

  // 先证明这套检测本身是有效的 —— 否则上面几条只是「永远绿」的摆设。
  it("检测器认得出写操作（反例自检）", () => {
    for (const bad of [
      'await getDb().algoNote.create({ data: {} })',
      "db.problem.updateMany({})",
      "prisma.algoNote.deleteMany()",
      "db.appSettings.upsert({})",
    ]) {
      expect(WRITE_CALLS.test(bad), bad).toBe(true);
    }
    expect(WRITE_CALLS.test("db.problem.findMany({})")).toBe(false);
    expect(WRITE_CALLS.test("rows.map((r) => r.id)")).toBe(false);
  });

  it("工具集里只有读工具", () => {
    const names = [...routeSource.matchAll(/name:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(ALLOWED_TOOLS, `工具 ${name} 不在只读白名单里`).toContain(name);
    }
  });

  it("每个白名单工具都真的接上了", () => {
    const names = new Set([...routeSource.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]));
    for (const tool of ALLOWED_TOOLS) {
      expect(names, `白名单里的 ${tool} 没在路由里声明`).toContain(tool);
      expect(routeSource, `${tool} 没有在 runTool 里处理`).toContain(`case "${tool}"`);
    }
  });

  it("数据层不含任何写操作", () => {
    expect(dataSource).not.toMatch(WRITE_CALLS);
  });

  it("路由自己也不写库，也不碰排题动作", () => {
    expect(routeSource).not.toMatch(WRITE_CALLS);
    // 排课助手那些会改计划/设置的函数，一个都不该出现在这里
    for (const forbidden of [
      "regenerateWeek",
      "savePlanSettings",
      "addProblemToDate",
      "moveProblemToDate",
      "removeProblemFromPlan",
      "setProblemReviewDays",
      "setCategoryEnabled",
      "saveAssistantSoul",
      "appendAssistantMemory",
      "createAlgoNote",
      "updateAlgoNote",
      "deleteAlgoNote",
    ]) {
      expect(routeSource, `不该引用 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("系统提示里向模型声明了只读", () => {
    expect(routeSource).toContain("你是只读的");
  });
});
