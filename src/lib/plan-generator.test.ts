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

  it("assigns tasks to concrete time slots and caps hard new problems per day", () => {
    const plan = generateWeeklyPlan({
      startDate: new Date("2026-06-23T00:00:00.000Z"),
      availabilitySlots: [
        {
          id: "slot-am",
          date: "2026-06-23",
          startTime: "09:00",
          endTime: "11:30",
          availableMinutes: 150,
          isAvailable: true,
        },
        {
          id: "slot-pm",
          date: "2026-06-23",
          startTime: "15:00",
          endTime: "16:00",
          availableMinutes: 60,
          isAvailable: true,
        },
      ],
      reviewCandidates: [],
      newProblemCandidates: [
        {
          problemId: "hard-1",
          kind: "new",
          title: "hard one",
          difficulty: "HARD",
          estimatedMinutes: 70,
          priority: 30,
        },
        {
          problemId: "hard-2",
          kind: "new",
          title: "hard two",
          difficulty: "HARD",
          estimatedMinutes: 70,
          priority: 29,
        },
        {
          problemId: "medium-1",
          kind: "new",
          title: "medium one",
          difficulty: "MEDIUM",
          estimatedMinutes: 45,
          priority: 20,
        },
        {
          problemId: "easy-1",
          kind: "new",
          title: "easy one",
          difficulty: "EASY",
          estimatedMinutes: 25,
          priority: 10,
        },
      ],
    });

    const day = plan.days[0];
    expect(day.slots).toHaveLength(2);
    expect(day.slots[0].items.map((item) => item.problemId)).toEqual([
      "medium-1",
      "hard-1",
      "easy-1",
    ]);
    expect(day.slots.flatMap((slot) => slot.items).filter((item) => item.difficulty === "HARD")).toHaveLength(1);
    expect(day.slots[0].totalEstimatedMinutes).toBeLessThanOrEqual(150);
    expect(plan.unscheduled.map((item) => item.problemId)).toContain("hard-2");
  });

  it("prioritizes high-risk old problems before ordinary new problems", () => {
    const plan = generateWeeklyPlan({
      startDate: new Date("2026-06-23T00:00:00.000Z"),
      availabilitySlots: [
        {
          id: "slot-am",
          date: "2026-06-23",
          startTime: "09:00",
          endTime: "11:30",
          availableMinutes: 150,
          isAvailable: true,
        },
      ],
      reviewCandidates: [
        {
          problemId: "risky-old",
          kind: "retest",
          title: "risky old",
          difficulty: "MEDIUM",
          dueDate: "2026-06-23",
          estimatedMinutes: 45,
          priority: 92,
        },
      ],
      newProblemCandidates: [
        {
          problemId: "ordinary-new",
          kind: "new",
          title: "ordinary new",
          difficulty: "MEDIUM",
          estimatedMinutes: 45,
          priority: 10,
        },
      ],
    });

    expect(plan.days[0].slots[0].items.map((item) => item.problemId)).toEqual([
      "risky-old",
      "ordinary-new",
    ]);
  });

  it("spreads hard review and retest tasks across different days", () => {
    const plan = generateWeeklyPlan({
      startDate: new Date("2026-06-23T00:00:00.000Z"),
      availabilitySlots: [
        {
          id: "day-1",
          date: "2026-06-23",
          startTime: "09:00",
          endTime: "11:30",
          availableMinutes: 150,
          isAvailable: true,
        },
        {
          id: "day-2",
          date: "2026-06-24",
          startTime: "09:00",
          endTime: "11:30",
          availableMinutes: 150,
          isAvailable: true,
        },
      ],
      reviewCandidates: [
        {
          problemId: "hard-review-1",
          kind: "review",
          title: "hard review one",
          difficulty: "HARD",
          estimatedMinutes: 35,
          priority: 100,
        },
        {
          problemId: "hard-review-2",
          kind: "retest",
          title: "hard review two",
          difficulty: "HARD",
          estimatedMinutes: 35,
          priority: 99,
        },
      ],
      newProblemCandidates: [],
    });

    expect(plan.days[0].items.map((item) => item.problemId)).toEqual(["hard-review-1"]);
    expect(plan.days[1].items.map((item) => item.problemId)).toEqual(["hard-review-2"]);
  });
});
