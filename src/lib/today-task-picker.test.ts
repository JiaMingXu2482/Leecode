import { describe, expect, it } from "vitest";
import { selectNextTodayTask } from "./today-task-picker";

describe("selectNextTodayTask", () => {
  it("chooses due reviews before new problems and fits remaining slot capacity", () => {
    const selected = selectNextTodayTask({
      existingProblemIds: new Set(["already-planned"]),
      hardNewCount: 0,
      slots: [{ id: "slot-1", remainingMinutes: 45 }],
      reviewCandidates: [
        {
          problemId: "due-review",
          kind: "review",
          title: "due",
          difficulty: "MEDIUM",
          dueDate: "2026-06-24",
          estimatedMinutes: 45,
          priority: 80,
        },
      ],
      newProblemCandidates: [
        {
          problemId: "new-medium",
          kind: "new",
          title: "new",
          difficulty: "MEDIUM",
          estimatedMinutes: 45,
          priority: 10,
        },
      ],
    });

    expect(selected?.candidate.problemId).toBe("due-review");
    expect(selected?.slotId).toBe("slot-1");
  });

  it("does not select duplicate tasks or tasks that exceed remaining capacity", () => {
    const selected = selectNextTodayTask({
      existingProblemIds: new Set(["due-review"]),
      hardNewCount: 0,
      slots: [{ id: "slot-1", remainingMinutes: 30 }],
      reviewCandidates: [
        {
          problemId: "due-review",
          kind: "review",
          title: "duplicate",
          difficulty: "EASY",
          dueDate: "2026-06-24",
          estimatedMinutes: 25,
          priority: 100,
        },
      ],
      newProblemCandidates: [
        {
          problemId: "too-large",
          kind: "new",
          title: "large",
          difficulty: "MEDIUM",
          estimatedMinutes: 45,
          priority: 10,
        },
      ],
    });

    expect(selected).toBeNull();
  });

  it("skips a second hard new task for the same day", () => {
    const selected = selectNextTodayTask({
      existingProblemIds: new Set(),
      hardNewCount: 1,
      slots: [{ id: "slot-1", remainingMinutes: 90 }],
      reviewCandidates: [],
      newProblemCandidates: [
        {
          problemId: "hard-new",
          kind: "new",
          title: "hard",
          difficulty: "HARD",
          estimatedMinutes: 70,
          priority: 100,
        },
        {
          problemId: "medium-new",
          kind: "new",
          title: "medium",
          difficulty: "MEDIUM",
          estimatedMinutes: 45,
          priority: 10,
        },
      ],
    });

    expect(selected?.candidate.problemId).toBe("medium-new");
  });
});
