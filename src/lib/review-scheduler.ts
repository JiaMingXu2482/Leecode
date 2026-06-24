export type RecallRating = "forgot" | "shaky" | "ok" | "mastered";
export type FeelingScore = 0 | 1 | 2 | 3 | 4 | 5;
export type ProblemDifficulty = "EASY" | "MEDIUM" | "HARD";

export type ReviewCalculationInput = {
  reviewedAt: Date;
  rating: RecallRating;
  currentStage: number;
  consecutiveStrong: number;
};

export type ReviewCalculationResult = {
  nextReviewDate: Date;
  stage: number;
  consecutiveStrong: number;
};

export type AcceptedProblemForScheduling = {
  problemId: string;
  difficulty: ProblemDifficulty;
  lastAcceptedAt: Date | null;
};

export type InitialReviewSchedule = {
  problemId: string;
  nextReviewDate: Date;
  stage: number;
  consecutiveStrong: number;
};

const MASTERED_INTERVALS_BY_STAGE = [1, 2, 4, 7, 15, 30];
const FEELING_SCORE_INTERVALS: Record<FeelingScore, number> = {
  0: 7,
  1: 5,
  2: 3,
  3: 2,
  4: 1,
  5: 1,
};

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysSince(reference: Date, maybePast: Date | null) {
  if (!maybePast) {
    return 90;
  }

  const ms = reference.getTime() - maybePast.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function difficultyWeight(difficulty: ProblemDifficulty) {
  if (difficulty === "HARD") {
    return 30;
  }

  if (difficulty === "MEDIUM") {
    return 15;
  }

  return 0;
}

export function calculateNextReview(
  input: ReviewCalculationInput,
): ReviewCalculationResult {
  if (input.rating === "forgot") {
    return {
      nextReviewDate: addUtcDays(input.reviewedAt, 1),
      stage: 1,
      consecutiveStrong: 0,
    };
  }

  if (input.rating === "shaky") {
    return {
      nextReviewDate: addUtcDays(input.reviewedAt, 2),
      stage: Math.max(1, input.currentStage - 1),
      consecutiveStrong: 0,
    };
  }

  if (input.rating === "ok") {
    return {
      nextReviewDate: addUtcDays(input.reviewedAt, 4),
      stage: Math.max(2, input.currentStage),
      consecutiveStrong: 0,
    };
  }

  const nextStage = Math.min(
    MASTERED_INTERVALS_BY_STAGE.length - 1,
    input.currentStage + 1,
  );

  return {
    nextReviewDate: addUtcDays(input.reviewedAt, MASTERED_INTERVALS_BY_STAGE[nextStage]),
    stage: nextStage,
    consecutiveStrong: input.consecutiveStrong + 1,
  };
}

export function reviewDaysForFeelingScore(score: FeelingScore) {
  return FEELING_SCORE_INTERVALS[score];
}

export function ratingForFeelingScore(score: FeelingScore): RecallRating {
  if (score >= 5) {
    return "forgot";
  }

  if (score >= 3) {
    return "shaky";
  }

  if (score >= 1) {
    return "ok";
  }

  return "mastered";
}

export function calculateFeelingScoreReview({
  reviewedAt,
  score,
  reviewAfterDays,
  currentStage,
  consecutiveStrong,
}: {
  reviewedAt: Date;
  score: FeelingScore;
  reviewAfterDays?: number;
  currentStage: number;
  consecutiveStrong: number;
}): ReviewCalculationResult & { rating: RecallRating; reviewAfterDays: number } {
  const rating = ratingForFeelingScore(score);
  const days =
    typeof reviewAfterDays === "number" && Number.isFinite(reviewAfterDays)
      ? Math.max(1, Math.floor(reviewAfterDays))
      : reviewDaysForFeelingScore(score);
  const base = calculateNextReview({
    reviewedAt,
    rating,
    currentStage,
    consecutiveStrong,
  });

  return {
    ...base,
    rating,
    reviewAfterDays: days,
    nextReviewDate: addUtcDays(reviewedAt, days),
  };
}

export function createInitialReviewSchedules({
  today,
  problems,
}: {
  today: Date;
  problems: AcceptedProblemForScheduling[];
}): InitialReviewSchedule[] {
  const sorted = [...problems].sort((a, b) => {
    const bScore = daysSince(today, b.lastAcceptedAt) + difficultyWeight(b.difficulty);
    const aScore = daysSince(today, a.lastAcceptedAt) + difficultyWeight(a.difficulty);
    return bScore - aScore;
  });

  const total = sorted.length;

  return sorted.map((problem, index) => {
    const offset = total <= 1 ? 1 : 1 + Math.round((index * 20) / (total - 1));

    return {
      problemId: problem.problemId,
      nextReviewDate: addUtcDays(today, offset),
      stage: 0,
      consecutiveStrong: 0,
    };
  });
}
