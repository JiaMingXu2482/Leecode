import { Prisma } from "@prisma/client";
import { CODEFUN_ID_BASE, CODEFUN_PROBLEMS, codefunFrontendId } from "@/lib/codefun-problems";
import { getDb } from "@/lib/db";
import { extractProblemRefs } from "@/lib/markdown";

const MINUTES = {
  EASY: { neu: 30, rev: 15 },
  MEDIUM: { neu: 50, rev: 25 },
  HARD: { neu: 70, rev: 35 },
} as const;

// 题单顺序（不是 frontendId）：新题池按 hot100Order 排序取出，orderDailyNewPicks
// 依赖「pool 按题单顺序到达」。frontendId 现在由 P 号推导，和顺序无关了。
function listOrder(index: number) {
  return CODEFUN_ID_BASE + index + 1;
}

// Imports 塔子哥's 华为题单 alongside the other problem sets. Idempotent:
// re-running only inserts what's missing and re-syncs the fields that come from
// the 题单 (分类/难度/标题/场次/顺序), never touching a problem's isEnabled flag
// or study history.
export async function ensureCodefunProblems() {
  const db = getDb();

  // 一次性迁移：老数据的 frontendId 是「题目在数组里的第几个」(20001..20069)，
  // 现在改成由 P 号推导(P4520 → 24520)。按 displayId 认题，做题记录/复习进度都
  // 挂在 Problem.id 上，跟着走不会丢。新旧区间不重叠(≤20069 vs ≥21490)，逐行
  // 更新不会撞 frontendId 的唯一约束。
  const legacy = await db.problem.findMany({
    where: { source: "CODEFUN", frontendId: { lt: CODEFUN_ID_BASE + 1000 } },
    select: { id: true, displayId: true },
  });
  let migrated = 0;
  for (const problem of legacy) {
    if (!/^P\d+$/.test(problem.displayId)) {
      continue;
    }
    await db.problem.update({
      where: { id: problem.id },
      data: { frontendId: codefunFrontendId(problem.displayId) },
    });
    migrated += 1;
  }

  // AlgoNote.refs 是从正文算出来的 frontendId 列表（"22352,10014"）。题号方案一变，
  // 老笔记里存的 CODEFUN 引用就指向不存在的题了，题目详情页的「相关算法总结」会空掉。
  // refs 本来就是派生数据，这里按新方案重算一遍。
  if (migrated > 0) {
    const notes = await db.algoNote.findMany({ select: { id: true, contentMarkdown: true, refs: true } });
    for (const note of notes) {
      const refs = extractProblemRefs(note.contentMarkdown).join(",");
      if (refs !== note.refs) {
        await db.algoNote.update({ where: { id: note.id }, data: { refs } });
      }
    }
  }

  const existing = await db.problem.findMany({
    where: { source: "CODEFUN" },
    select: {
      id: true,
      frontendId: true,
      tags: true,
      difficulty: true,
      titleCn: true,
      examOrigin: true,
      hot100Order: true,
      categoryOverride: true,
    },
  });
  const byFrontendId = new Map(existing.map((problem) => [problem.frontendId, problem]));

  const toCreate: Prisma.ProblemCreateManyInput[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  // Keep the 题单-derived fields in step with the code — problems are created
  // once, so a later re-categorisation or re-order would otherwise never reach
  // rows that already exist.
  CODEFUN_PROBLEMS.forEach(([pid, difficulty, codeCategory, title, origin], index) => {
    const frontendId = codefunFrontendId(pid);
    const order = listOrder(index);
    const row = byFrontendId.get(frontendId);
    // 用户在界面上改过分类的，以他改的为准 —— 否则每次导入都会被代码里的值冲掉。
    const category = row?.categoryOverride || codeCategory;

    if (!row) {
      toCreate.push({
        frontendId,
        source: "CODEFUN",
        displayId: pid,
        title,
        titleCn: title,
        slug: `codefun-${pid.toLowerCase()}`,
        leetcodeCnUrl: `https://codefun2000.com/p/${pid}`,
        difficulty,
        tags: category,
        examOrigin: origin,
        hot100Order: order,
        estimatedNewMinutes: MINUTES[difficulty].neu,
        estimatedReviewMinutes: MINUTES[difficulty].rev,
      });
      return;
    }

    const unchanged =
      row.tags === category &&
      row.difficulty === difficulty &&
      row.titleCn === title &&
      row.examOrigin === origin &&
      row.hot100Order === order;
    if (unchanged) {
      return;
    }

    // 难度变了估时也跟着变。
    updates.push(
      db.problem.update({
        where: { id: row.id },
        data: {
          tags: category,
          difficulty,
          title,
          titleCn: title,
          examOrigin: origin,
          hot100Order: order,
          estimatedNewMinutes: MINUTES[difficulty].neu,
          estimatedReviewMinutes: MINUTES[difficulty].rev,
        },
      }),
    );
  });

  if (updates.length) {
    await db.$transaction(updates);
  }
  if (toCreate.length) {
    await db.problem.createMany({ data: toCreate });
  }
  return { migrated, created: toCreate.length, resynced: updates.length };
}
