import type { Problem } from "@prisma/client";

type LeetCodeGraphqlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

type QuestionData = {
  question: {
    status: string | null;
  } | null;
};

type SubmissionListData = {
  submissionList: {
    submissions: SubmissionMetricInput[];
  };
};

export type SubmissionMetricInput = {
  statusDisplay: string;
  timestamp: string;
};

export type SubmissionMetrics = {
  totalSubmissions: number;
  acceptedSubmissions: number;
  acceptedRate: number;
  lastSubmittedAt: Date | null;
  lastAcceptedAt: Date | null;
};

export type SyncedProblemStatus = {
  problemId: string;
  accepted: boolean;
} & SubmissionMetrics;

const ACCEPTED_CN = "\u901a\u8fc7";

function isAcceptedSubmission(statusDisplay: string) {
  return statusDisplay === "Accepted" || statusDisplay === ACCEPTED_CN;
}

function timestampToDate(timestamp: string) {
  return new Date(Number(timestamp) * 1000);
}

export function calculateSubmissionMetrics(
  submissions: SubmissionMetricInput[],
): SubmissionMetrics {
  if (!submissions.length) {
    return {
      totalSubmissions: 0,
      acceptedSubmissions: 0,
      acceptedRate: 0,
      lastSubmittedAt: null,
      lastAcceptedAt: null,
    };
  }

  const sorted = [...submissions].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const accepted = sorted.filter((submission) => isAcceptedSubmission(submission.statusDisplay));

  return {
    totalSubmissions: sorted.length,
    acceptedSubmissions: accepted.length,
    acceptedRate: Math.round((accepted.length / sorted.length) * 100),
    lastSubmittedAt: timestampToDate(sorted[0].timestamp),
    lastAcceptedAt: accepted[0] ? timestampToDate(accepted[0].timestamp) : null,
  };
}

async function graphql<T>({
  cookie,
  query,
  variables,
}: {
  cookie: string;
  query: string;
  variables: Record<string, unknown>;
}) {
  const response = await fetch("https://leetcode.cn/graphql/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      referer: "https://leetcode.cn/problemset/",
      "user-agent": "leetcode-review-planner/1.0",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`leetcode.cn returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LeetCodeGraphqlResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  if (!payload.data) {
    throw new Error("leetcode.cn returned an empty GraphQL payload");
  }

  return payload.data;
}

async function fetchQuestionStatus(cookie: string, slug: string) {
  const data = await graphql<QuestionData>({
    cookie,
    query: `
      query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          status
        }
      }
    `,
    variables: { titleSlug: slug },
  });

  return data.question?.status === "ac";
}

async function fetchSubmissionMetrics(cookie: string, slug: string) {
  const data = await graphql<SubmissionListData>({
    cookie,
    query: `
      query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
        submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
          submissions {
            statusDisplay
            timestamp
          }
        }
      }
    `,
    variables: { offset: 0, limit: 50, questionSlug: slug },
  });

  return calculateSubmissionMetrics(data.submissionList.submissions);
}

export async function syncLeetCodeCnProblems({
  cookie,
  problems,
}: {
  cookie: string;
  problems: Problem[];
}): Promise<SyncedProblemStatus[]> {
  const results: SyncedProblemStatus[] = [];

  for (const problem of problems) {
    const accepted = await fetchQuestionStatus(cookie, problem.slug);
    const metrics = await fetchSubmissionMetrics(cookie, problem.slug);

    results.push({
      problemId: problem.id,
      accepted,
      ...metrics,
    });
  }

  return results;
}
