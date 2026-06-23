import type { ProblemDifficulty } from "./review-scheduler";

export function calculateReviewRiskScore({
  acceptedRate,
  totalSubmissions,
  lastAcceptedAt,
  nextReviewDate,
  difficulty,
  today = new Date(),
}: {
  acceptedRate: number;
  totalSubmissions: number;
  lastAcceptedAt: Date | null;
  nextReviewDate?: Date | null;
  difficulty: ProblemDifficulty;
  today?: Date;
}) {
  let score = 0;

  if (acceptedRate > 0) {
    score += Math.max(0, 100 - acceptedRate);
  }

  score += Math.min(30, Math.max(0, totalSubmissions - 1) * 4);

  if (difficulty === "HARD") {
    score += 18;
  } else if (difficulty === "MEDIUM") {
    score += 10;
  }

  const reference = nextReviewDate ?? lastAcceptedAt;
  if (reference) {
    const ageDays = Math.floor((today.getTime() - reference.getTime()) / 86_400_000);
    score += Math.min(35, Math.max(0, ageDays));
  } else {
    score += 20;
  }

  return Math.min(100, Math.round(score));
}
