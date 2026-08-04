import { getDb } from "@/lib/db";
import {
  NOWCODER_ID_BASE,
  NOWCODER_PROBLEMS,
  nowcoderFrontendId,
  nowcoderTopicForHj,
} from "@/lib/nowcoder-problems";

const MINUTES = {
  EASY: { neu: 25, rev: 15 },
  MEDIUM: { neu: 45, rev: 25 },
  HARD: { neu: 70, rev: 35 },
} as const;

// Imports the 牛客 HJ problem set alongside the existing LeetCode problems, and
// backfills displayId for the LeetCode ones. Idempotent: re-running only fills
// in what's missing, never touches a problem's isEnabled flag or study history.
export async function ensureNowcoderProblems() {
  const db = getDb();

  // 1. Backfill displayId for LeetCode problems added before the column existed.
  const legacy = await db.problem.findMany({
    where: { displayId: "" , source: "LEETCODE" },
    select: { id: true, frontendId: true },
  });
  for (const problem of legacy) {
    await db.problem.update({
      where: { id: problem.id },
      data: { displayId: String(problem.frontendId) },
    });
  }

  // 2. Keep stored tags in step with the code's classification — problems are
  // only created once, so a later re-categorisation would otherwise never
  // reach rows that already exist.
  const existing = await db.problem.findMany({
    where: { source: "NOWCODER" },
    select: { id: true, frontendId: true, tags: true },
  });
  let retagged = 0;
  for (const problem of existing) {
    const want = nowcoderTopicForHj(problem.frontendId - NOWCODER_ID_BASE);
    if (problem.tags !== want) {
      await db.problem.update({ where: { id: problem.id }, data: { tags: want } });
      retagged += 1;
    }
  }

  // 3. Insert any 牛客 problems that aren't in the DB yet.
  const have = new Set(existing.map((p) => p.frontendId));

  const toCreate = NOWCODER_PROBLEMS.filter(([hj]) => !have.has(nowcoderFrontendId(hj))).map(
    ([hj, title, hash, difficulty]) => ({
      frontendId: nowcoderFrontendId(hj),
      source: "NOWCODER",
      displayId: `HJ${hj}`,
      title,
      titleCn: title,
      slug: `nowcoder-hj${hj}`,
      leetcodeCnUrl: `https://www.nowcoder.com/practice/${hash}?tpId=37`,
      difficulty,
      tags: nowcoderTopicForHj(hj),
      // Keeps 牛客 problems ordered after Hot100 and in HJ order among themselves.
      hot100Order: nowcoderFrontendId(hj),
      estimatedNewMinutes: MINUTES[difficulty].neu,
      estimatedReviewMinutes: MINUTES[difficulty].rev,
    }),
  );

  if (toCreate.length) {
    await db.problem.createMany({ data: toCreate });
  }
  return { backfilled: legacy.length, created: toCreate.length, retagged };
}
