import { topicForFrontendId } from "./topics";

export type NewPickCandidate = {
  id: string;
  frontendId: number;
  estimatedNewMinutes: number;
};

// Pick one day's worth of new problems from `pool` (already filtered to
// enabled + never-studied, in problem order). Three passes:
//   1. one problem from each priority category, in the configured order;
//   2. fill remaining slots from categories not used yet today, so a day is a
//      mix of problem types rather than four string-parsing problems in a row;
//   3. if distinct categories run out, backfill by plain pool order.
// Category-internal order is always pool order, so problems still come in
// ascending number within a type.
// `alreadyUsedCategories` are the categories already on the target day — the
// scheduler tops a day up in batches, so without this a later batch would
// happily add a third 数组与排序 problem to a day that already has two.
export function orderDailyNewPicks<T extends NewPickCandidate>(
  pool: T[],
  priorityCategories: string[],
  count: number,
  alreadyUsedCategories: Iterable<string> = [],
): T[] {
  const picks: T[] = [];
  const used = new Set<string>();
  const usedCategories = new Set<string>(alreadyUsedCategories);

  const take = (candidate: T) => {
    used.add(candidate.id);
    usedCategories.add(topicForFrontendId(candidate.frontendId));
    picks.push(candidate);
  };

  for (const category of priorityCategories) {
    if (picks.length >= count) {
      break;
    }
    const hit = pool.find(
      (candidate) =>
        !used.has(candidate.id) && topicForFrontendId(candidate.frontendId) === category,
    );
    if (hit) {
      take(hit);
    }
  }

  while (picks.length < count) {
    const fresh = pool.find(
      (candidate) =>
        !used.has(candidate.id) && !usedCategories.has(topicForFrontendId(candidate.frontendId)),
    );
    if (!fresh) {
      break;
    }
    take(fresh);
  }

  for (const candidate of pool) {
    if (picks.length >= count) {
      break;
    }
    if (!used.has(candidate.id)) {
      take(candidate);
    }
  }

  return picks;
}
