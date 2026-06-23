import type { ProblemDifficulty } from "./review-scheduler";

type PlanKind = "review" | "retest" | "new";

export type AvailabilityInput = {
  date: string;
  availableMinutes: number;
  isAvailable: boolean;
};

export type PlanCandidate = {
  problemId: string;
  kind: PlanKind;
  title: string;
  difficulty: ProblemDifficulty;
  dueDate?: string;
  estimatedMinutes: number;
  priority: number;
};

export type GeneratedPlanItem = PlanCandidate;

export type GeneratedPlanDay = {
  date: string;
  availableMinutes: number;
  totalEstimatedMinutes: number;
  items: GeneratedPlanItem[];
};

export type GeneratedWeeklyPlan = {
  days: GeneratedPlanDay[];
  unscheduled: GeneratedPlanItem[];
};

function compareCandidates(a: PlanCandidate, b: PlanCandidate) {
  const dueCompare = (a.dueDate ?? "9999-12-31").localeCompare(
    b.dueDate ?? "9999-12-31",
  );

  if (dueCompare !== 0) {
    return dueCompare;
  }

  return b.priority - a.priority;
}

function canFit(day: GeneratedPlanDay, item: PlanCandidate) {
  return day.totalEstimatedMinutes + item.estimatedMinutes <= day.availableMinutes;
}

function placeCandidate(days: GeneratedPlanDay[], candidate: PlanCandidate) {
  const targetDay = days.find((day) => {
    if (day.availableMinutes <= 0 || !canFit(day, candidate)) {
      return false;
    }

    if (candidate.kind === "new") {
      return day.items.every((item) => item.kind === "new");
    }

    return true;
  });

  if (!targetDay) {
    return false;
  }

  targetDay.items.push(candidate);
  targetDay.totalEstimatedMinutes += candidate.estimatedMinutes;
  return true;
}

export function generateWeeklyPlan({
  availability,
  reviewCandidates,
  newProblemCandidates,
}: {
  startDate: Date;
  availability: AvailabilityInput[];
  reviewCandidates: PlanCandidate[];
  newProblemCandidates: PlanCandidate[];
}): GeneratedWeeklyPlan {
  const days: GeneratedPlanDay[] = availability.map((slot) => ({
    date: slot.date,
    availableMinutes: slot.isAvailable ? Math.max(0, slot.availableMinutes) : 0,
    totalEstimatedMinutes: 0,
    items: [],
  }));

  const unscheduled: GeneratedPlanItem[] = [];
  for (const candidate of reviewCandidates.sort(compareCandidates)) {
    if (!placeCandidate(days, candidate)) {
      unscheduled.push(candidate);
    }
  }

  for (const candidate of newProblemCandidates.sort(compareCandidates)) {
    if (!placeCandidate(days, candidate)) {
      unscheduled.push(candidate);
    }
  }

  return { days, unscheduled };
}
