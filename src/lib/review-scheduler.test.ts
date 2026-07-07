import { describe, expect, it } from "vitest";
import {
  calculateFeelingScoreReview,
  calculateNextReview,
  createInitialReviewSchedules,
  defaultReviewDays,
  ratingForFeelingScore,
  reviewDaysForFeelingScore,
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

describe("feeling score review", () => {
  const reviewedAt = new Date("2026-06-23T10:00:00.000Z");

  it("maps 0-5 feeling scores to the expected default review intervals", () => {
    expect([0, 1, 2, 3, 4, 5].map((score) => reviewDaysForFeelingScore(score as 0 | 1 | 2 | 3 | 4 | 5))).toEqual([
      7,
      5,
      3,
      2,
      1,
      1,
    ]);
  });

  it("maps feeling scores to the stored recall rating", () => {
    expect(ratingForFeelingScore(0)).toBe("mastered");
    expect(ratingForFeelingScore(1)).toBe("ok");
    expect(ratingForFeelingScore(2)).toBe("ok");
    expect(ratingForFeelingScore(3)).toBe("shaky");
    expect(ratingForFeelingScore(4)).toBe("shaky");
    expect(ratingForFeelingScore(5)).toBe("forgot");
  });

  it("uses manual review days as an override for the next review date", () => {
    const result = calculateFeelingScoreReview({
      reviewedAt,
      score: 0,
      reviewAfterDays: 3,
      currentStage: 0,
      consecutiveStrong: 0,
    });

    expect(result.rating).toBe("mastered");
    expect(result.reviewAfterDays).toBe(3);
    expect(result.nextReviewDate.toISOString().slice(0, 10)).toBe("2026-06-26");
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

describe("defaultReviewDays", () => {
  it("gives two weeks when the average (incl. current score) is below 2", () => {
    // first-ever attempt, quick AC: avg = 0
    expect(defaultReviewDays(0, null, 0)).toBe(14);
    // history avg 1.5 over 2 sessions, now scored 2 → avg (3+2)/3 ≈ 1.67
    expect(defaultReviewDays(2, 1.5, 2)).toBe(14);
  });

  it("gives one week when the average lands in [2, 3)", () => {
    // first attempt scored 2 → avg 2
    expect(defaultReviewDays(2, null, 0)).toBe(7);
    // history avg 3 over 3 sessions, now scored 0 → avg 9/4 = 2.25
    expect(defaultReviewDays(0, 3, 3)).toBe(7);
  });

  it("falls back to the per-score interval when the average is 3 or higher", () => {
    // first attempt scored 3 → avg 3 → per-score interval (2 days)
    expect(defaultReviewDays(3, null, 0)).toBe(2);
    // history avg 5 over 4 sessions, now scored 4 → avg 4.8 → interval for 4 (1 day)
    expect(defaultReviewDays(4, 5, 4)).toBe(1);
    // 陌生 on a weak problem → next day
    expect(defaultReviewDays(5, 4, 2)).toBe(1);
  });
});
