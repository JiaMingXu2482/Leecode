import type { PlanCandidate } from "./plan-generator";
import type { ProblemDifficulty } from "./review-scheduler";

export type TodayCapacitySlot = {
  id: string | null;
  remainingMinutes: number;
};

const newDifficultyOrder: Record<ProblemDifficulty, number> = {
  MEDIUM: 0,
  HARD: 1,
  EASY: 2,
};

function reviewSort(a: PlanCandidate, b: PlanCandidate) {
  const dueCompare = (a.dueDate ?? "9999-12-31").localeCompare(
    b.dueDate ?? "9999-12-31",
  );

  if (dueCompare !== 0) {
    return dueCompare;
  }

  return b.priority - a.priority;
}

function newSort(a: PlanCandidate, b: PlanCandidate) {
  const difficultyCompare = newDifficultyOrder[a.difficulty] - newDifficultyOrder[b.difficulty];

  if (difficultyCompare !== 0) {
    return difficultyCompare;
  }

  return b.priority - a.priority;
}

function placeableSlot(slots: TodayCapacitySlot[], candidate: PlanCandidate) {
  return slots.find((slot) => slot.remainingMinutes >= candidate.estimatedMinutes) ?? null;
}

function canUseCandidate({
  candidate,
  existingProblemIds,
  hardNewCount,
}: {
  candidate: PlanCandidate;
  existingProblemIds: Set<string>;
  hardNewCount: number;
}) {
  if (existingProblemIds.has(candidate.problemId)) {
    return false;
  }

  if (candidate.kind === "new" && candidate.difficulty === "HARD" && hardNewCount >= 1) {
    return false;
  }

  return true;
}

export function selectNextTodayTask({
  reviewCandidates,
  newProblemCandidates,
  existingProblemIds,
  slots,
  hardNewCount,
}: {
  reviewCandidates: PlanCandidate[];
  newProblemCandidates: PlanCandidate[];
  existingProblemIds: Set<string>;
  slots: TodayCapacitySlot[];
  hardNewCount: number;
}) {
  const ordered = [
    ...[...reviewCandidates].sort(reviewSort),
    ...[...newProblemCandidates].sort(newSort),
  ];

  for (const candidate of ordered) {
    if (!canUseCandidate({ candidate, existingProblemIds, hardNewCount })) {
      continue;
    }

    const slot = placeableSlot(slots, candidate);
    if (slot) {
      return { candidate, slotId: slot.id };
    }
  }

  return null;
}
