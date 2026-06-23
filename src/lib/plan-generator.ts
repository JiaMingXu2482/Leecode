import type { ProblemDifficulty } from "./review-scheduler";

type PlanKind = "review" | "retest" | "new";

export type AvailabilityInput = {
  date: string;
  availableMinutes: number;
  isAvailable: boolean;
};

export type AvailabilitySlotInput = AvailabilityInput & {
  id: string;
  startTime: string;
  endTime: string;
};

export type PlanCandidate = {
  problemId: string;
  kind: PlanKind;
  title: string;
  difficulty: ProblemDifficulty;
  tags?: string[];
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
  slots: GeneratedPlanSlot[];
};

export type GeneratedPlanSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
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

function slotCanFit(slot: GeneratedPlanSlot, item: PlanCandidate) {
  return slot.totalEstimatedMinutes + item.estimatedMinutes <= slot.availableMinutes;
}

function hardCount(day: GeneratedPlanDay) {
  return day.items.filter((item) => item.difficulty === "HARD").length;
}

function canPlaceByMix(day: GeneratedPlanDay, candidate: PlanCandidate) {
  if (candidate.difficulty === "HARD" && hardCount(day) >= 1) {
    return false;
  }

  const last = day.items.at(-1);
  if (!last || !candidate.tags?.length || !last.tags?.length) {
    return true;
  }

  return !candidate.tags.some((tag) => last.tags?.includes(tag));
}

function placeCandidate(days: GeneratedPlanDay[], candidate: PlanCandidate) {
  const target = days
    .flatMap((day) => day.slots.map((slot) => ({ day, slot })))
    .find(({ day, slot }) => {
      if (slot.availableMinutes <= 0 || !slotCanFit(slot, candidate) || !canFit(day, candidate)) {
        return false;
      }

      if (!canPlaceByMix(day, candidate)) {
        return false;
      }

      return true;
    });

  if (!target) {
    return false;
  }

  target.slot.items.push(candidate);
  target.slot.totalEstimatedMinutes += candidate.estimatedMinutes;
  target.day.items.push(candidate);
  target.day.totalEstimatedMinutes += candidate.estimatedMinutes;
  return true;
}

function legacyAvailabilityToSlots(availability: AvailabilityInput[]): AvailabilitySlotInput[] {
  return availability.map((slot) => ({
    id: `${slot.date}-default`,
    date: slot.date,
    startTime: "09:00",
    endTime: "11:30",
    availableMinutes: slot.availableMinutes,
    isAvailable: slot.isAvailable,
  }));
}

function buildDays(slots: AvailabilitySlotInput[]) {
  const byDate = new Map<string, AvailabilitySlotInput[]>();

  for (const slot of slots) {
    if (!slot.isAvailable) {
      continue;
    }

    const existing = byDate.get(slot.date) ?? [];
    existing.push(slot);
    byDate.set(slot.date, existing);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => {
      const generatedSlots = daySlots
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((slot) => ({
          id: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          availableMinutes: Math.max(0, slot.availableMinutes),
          totalEstimatedMinutes: 0,
          items: [] as GeneratedPlanItem[],
        }));

      return {
        date,
        availableMinutes: generatedSlots.reduce((sum, slot) => sum + slot.availableMinutes, 0),
        totalEstimatedMinutes: 0,
        items: [] as GeneratedPlanItem[],
        slots: generatedSlots,
      };
    });
}

function sortNewCandidates(candidates: PlanCandidate[]) {
  const difficultyOrder: Record<ProblemDifficulty, number> = {
    MEDIUM: 0,
    HARD: 1,
    EASY: 2,
  };

  return [...candidates].sort((a, b) => {
    const difficultyCompare = difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];

    if (difficultyCompare !== 0) {
      return difficultyCompare;
    }

    return b.priority - a.priority;
  });
}

function placeLegacyCandidate(days: GeneratedPlanDay[], candidate: PlanCandidate) {
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
  targetDay.slots[0]?.items.push(candidate);
  if (targetDay.slots[0]) {
    targetDay.slots[0].totalEstimatedMinutes += candidate.estimatedMinutes;
  }
  targetDay.totalEstimatedMinutes += candidate.estimatedMinutes;
  return true;
}

export function generateWeeklyPlan({
  availabilitySlots,
  availability,
  reviewCandidates,
  newProblemCandidates,
}: {
  startDate: Date;
  availability?: AvailabilityInput[];
  availabilitySlots?: AvailabilitySlotInput[];
  reviewCandidates: PlanCandidate[];
  newProblemCandidates: PlanCandidate[];
}): GeneratedWeeklyPlan {
  const normalizedSlots = availabilitySlots ?? legacyAvailabilityToSlots(availability ?? []);
  const days: GeneratedPlanDay[] = availabilitySlots
    ? buildDays(normalizedSlots)
    : (availability ?? []).map((slot) => ({
        date: slot.date,
        availableMinutes: slot.isAvailable ? Math.max(0, slot.availableMinutes) : 0,
        totalEstimatedMinutes: 0,
        items: [],
        slots: legacyAvailabilityToSlots([slot]).map((legacySlot) => ({
          ...legacySlot,
          totalEstimatedMinutes: 0,
          items: [] as GeneratedPlanItem[],
        })),
      }));

  const unscheduled: GeneratedPlanItem[] = [];
  for (const candidate of reviewCandidates.sort(compareCandidates)) {
    if (!(availabilitySlots ? placeCandidate(days, candidate) : placeLegacyCandidate(days, candidate))) {
      unscheduled.push(candidate);
    }
  }

  for (const candidate of sortNewCandidates(newProblemCandidates)) {
    if (!(availabilitySlots ? placeCandidate(days, candidate) : placeLegacyCandidate(days, candidate))) {
      unscheduled.push(candidate);
    }
  }

  return { days, unscheduled };
}
