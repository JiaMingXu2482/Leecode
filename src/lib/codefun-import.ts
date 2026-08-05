import {
  CODEFUN_ID_BASE,
  CODEFUN_PROBLEMS,
  codefunFrontendId,
  codefunTopicForIndex,
  difficultyForScore,
} from "@/lib/codefun-problems";
import { getDb } from "@/lib/db";

const MINUTES = {
  EASY: { neu: 30, rev: 15 },
  MEDIUM: { neu: 50, rev: 25 },
  HARD: { neu: 70, rev: 35 },
} as const;

// Imports 塔子哥's 速成题单 alongside the other problem sets. Idempotent:
// re-running only inserts what's missing and re-syncs tags, never touching a
// problem's isEnabled flag or study history.
export async function ensureCodefunProblems() {
  const db = getDb();

  const existing = await db.problem.findMany({
    where: { source: "CODEFUN" },
    select: { id: true, frontendId: true, tags: true },
  });

  // Keep stored tags in step with the code — problems are created once, so a
  // later re-categorisation would otherwise never reach existing rows.
  let retagged = 0;
  for (const problem of existing) {
    const want = codefunTopicForIndex(problem.frontendId - CODEFUN_ID_BASE);
    if (problem.tags !== want) {
      await db.problem.update({ where: { id: problem.id }, data: { tags: want } });
      retagged += 1;
    }
  }

  const have = new Set(existing.map((p) => p.frontendId));
  const toCreate = CODEFUN_PROBLEMS.map(([pid, score, category, title], index) => ({
    pid,
    score,
    category,
    title,
    index: index + 1,
  }))
    .filter((row) => !have.has(codefunFrontendId(row.index)))
    .map((row) => {
      const difficulty = difficultyForScore(row.score);
      return {
        frontendId: codefunFrontendId(row.index),
        source: "CODEFUN",
        displayId: row.pid,
        title: row.title,
        titleCn: row.title,
        slug: `codefun-${row.pid.toLowerCase()}`,
        leetcodeCnUrl: `https://codefun2000.com/p/${row.pid}`,
        difficulty,
        tags: row.category,
        // Keeps the 题单's own order — that's the order the guide wants you to
        // work through, category by category.
        hot100Order: codefunFrontendId(row.index),
        estimatedNewMinutes: MINUTES[difficulty].neu,
        estimatedReviewMinutes: MINUTES[difficulty].rev,
      };
    });

  if (toCreate.length) {
    await db.problem.createMany({ data: toCreate });
  }
  return { created: toCreate.length, retagged };
}
