import { describe, expect, it } from "vitest";
import {
  calculateNextReview,
  createInitialReviewSchedules,
} from "./review-scheduler";

describe("calculateNextReview", () => {
  const reviewedAt = new Date("2026-06-23T10:00:00.000Z");

  it("schedules weak recall for the next day and resets streak", () => {
    const result = calculateNextReview({
      reviewedAt,
      rating: "forgot",
      currentStage: 4,
      consecutiveStrong: 3,
    });

    expect(result.nextReviewDate.toISOString().slice(0, 10)).toBe("2026-06-24");
    expect(result.stage).toBe(1);
    expect(result.consecutiveStrong).toBe(0);
  });

  it("extends strong recall through the Ebbinghaus intervals", () => {
    const result = calculateNextReview({
      reviewedAt,
      rating: "mastered",
      currentStage: 3,
      consecutiveStrong: 1,
    });

    expect(result.nextReviewDate.toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(result.stage).toBe(4);
    expect(result.consecutiveStrong).toBe(2);
  });
});

describe("createInitialReviewSchedules", () => {
  it("spreads accepted old problems across the next three weeks", () => {
    const schedules = createInitialReviewSchedules({
      today: new Date("2026-06-23T00:00:00.000Z"),
      problems: [
        {
          problemId: "p1",
          difficulty: "HARD",
          lastAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          problemId: "p2",
          difficulty: "MEDIUM",
          lastAcceptedAt: new Date("2026-06-20T00:00:00.000Z"),
        },
        {
          problemId: "p3",
          difficulty: "EASY",
          lastAcceptedAt: null,
        },
      ],
    });

    expect(schedules).toHaveLength(3);
    expect(schedules.map((item) => item.problemId)).toEqual(["p1", "p3", "p2"]);
    expect(schedules[0].nextReviewDate.toISOString().slice(0, 10)).toBe("2026-06-24");
    expect(schedules[2].nextReviewDate.toISOString().slice(0, 10)).toBe("2026-07-14");
  });
});
