import { describe, expect, it } from "vitest";
import { generateWeeklyPlan } from "./plan-generator";

describe("generateWeeklyPlan", () => {
  it("prioritizes overdue reviews and stays within each available day budget", () => {
    const plan = generateWeeklyPlan({
      startDate: new Date("2026-06-23T00:00:00.000Z"),
      availability: [
        { date: "2026-06-23", availableMinutes: 120, isAvailable: true },
        { date: "2026-06-24", availableMinutes: 0, isAvailable: false },
        { date: "2026-06-25", availableMinutes: 150, isAvailable: true },
      ],
      reviewCandidates: [
        {
          problemId: "r1",
          kind: "review",
          title: "两数之和",
          difficulty: "EASY",
          dueDate: "2026-06-21",
          estimatedMinutes: 30,
          priority: 100,
        },
        {
          problemId: "r2",
          kind: "retest",
          title: "最长递增子序列",
          difficulty: "MEDIUM",
          dueDate: "2026-06-23",
          estimatedMinutes: 45,
          priority: 70,
        },
      ],
      newProblemCandidates: [
        {
          problemId: "n1",
          kind: "new",
          title: "接雨水",
          difficulty: "HARD",
          estimatedMinutes: 70,
          priority: 10,
        },
        {
          problemId: "n2",
          kind: "new",
          title: "有效括号",
          difficulty: "EASY",
          estimatedMinutes: 25,
          priority: 5,
        },
      ],
    });

    expect(plan.days[0].date).toBe("2026-06-23");
    expect(plan.days[0].totalEstimatedMinutes).toBeLessThanOrEqual(120);
    expect(plan.days[0].items.map((item) => item.problemId)).toEqual(["r1", "r2"]);
    expect(plan.days[1].items).toHaveLength(0);
    expect(plan.days[2].items.map((item) => item.problemId)).toEqual(["n1", "n2"]);
    expect(plan.unscheduled).toHaveLength(0);
  });
});
