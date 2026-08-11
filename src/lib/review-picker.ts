import { hot100TopicsForAcmTopics } from "./topic-affinity";
import { topicForFrontendId } from "./topics";

export type ReviewCandidate = {
  problemId: string;
  frontendId: number;
  estimatedReviewMinutes: number;
  nextReviewDate: Date;
  avgFeelingScore: number | null;
};

// Never-rated problems sit between "无提示 AC"(2) and "提交错误"(3) so they
// don't jump the queue ahead of problems the user demonstrably struggled with,
// and don't sink below the ones they clearly own.
const NEUTRAL_FEELING = 2.5;

// Pick a day's Hot100 reviews by TOPIC rather than by due date.
//
// Ranking, in order:
//   1. how well the problem's category matches the day's new ACM problems;
//   2. weakness — the higher the average feedback score the shakier it is
//      (0 = AC 快 … 5 = 陌生), so the worst-remembered题 come back first;
//   3. due date, most overdue first, as the final tiebreaker.
//
// Note this deliberately ignores whether a problem is actually due — that's the
// point of the mode. The forgetting curve still drives 牛客/速成题单 reviews.
export function orderTopicMatchedReviews<T extends ReviewCandidate>(
  candidates: T[],
  acmTopics: Iterable<string>,
  count: number,
): T[] {
  if (count <= 0) {
    return [];
  }
  const ranked = hot100TopicsForAcmTopics(acmTopics);
  const rankByTopic = new Map(ranked.map((name, index) => [name, index]));
  return candidates
    .map((candidate) => ({
      candidate,
      topicRank: rankByTopic.get(topicForFrontendId(candidate.frontendId)) ?? Number.MAX_SAFE_INTEGER,
      weakness: candidate.avgFeelingScore ?? NEUTRAL_FEELING,
    }))
    .sort(
      (a, b) =>
        a.topicRank - b.topicRank ||
        b.weakness - a.weakness ||
        a.candidate.nextReviewDate.getTime() - b.candidate.nextReviewDate.getTime(),
    )
    .slice(0, count)
    .map((entry) => entry.candidate);
}
