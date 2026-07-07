import { topicForFrontendId } from "./topics";

export type NewPickCandidate = {
  id: string;
  frontendId: number;
  estimatedNewMinutes: number;
};

// Pick one day's worth of new problems from `pool` (already filtered to
// enabled + never-studied, in Hot100 order): first one problem from each
// priority category (in the configured order, category-internal order = pool
// order), then fill the remaining quota by plain pool order. Categories that
// are exhausted simply contribute nothing and the quota is backfilled.
export function orderDailyNewPicks<T extends NewPickCandidate>(
  pool: T[],
  priorityCategories: string[],
  count: number,
): T[] {
  const picks: T[] = [];
  const used = new Set<string>();

  for (const category of priorityCategories) {
    if (picks.length >= count) {
      break;
    }
    const hit = pool.find(
      (candidate) =>
        !used.has(candidate.id) && topicForFrontendId(candidate.frontendId) === category,
    );
    if (hit) {
      used.add(hit.id);
      picks.push(hit);
    }
  }

  for (const candidate of pool) {
    if (picks.length >= count) {
      break;
    }
    if (!used.has(candidate.id)) {
      used.add(candidate.id);
      picks.push(candidate);
    }
  }

  return picks;
}
