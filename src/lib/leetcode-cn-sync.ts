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
    submissions: LeetCodeSubmissionSummary[];
  };
};

type SubmissionDetailsData = {
  submissionDetails: {
    code: string | null;
    lang?: string | null;
    statusDisplay?: string | null;
    timestamp?: string | null;
  } | null;
};

export type SubmissionMetricInput = {
  statusDisplay: string;
  timestamp: string;
};

export type LeetCodeSubmissionSummary = SubmissionMetricInput & {
  id: string;
  lang?: string | null;
};

export type SyncedLeetCodeSubmission = {
  submissionId: string;
  language: string;
  statusDisplay: string;
  isAccepted: boolean;
  submittedAt: Date;
  code: string;
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
  submissions: SyncedLeetCodeSubmission[];
  codeSyncError: string;
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

export function selectSubmissionsForCodeSync(
  submissions: LeetCodeSubmissionSummary[],
  options: { maxAccepted?: number } = {},
) {
  const maxAccepted = options.maxAccepted ?? 3;
  const sorted = [...submissions]
    .filter((submission) => submission.id)
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const selected = sorted
    .filter((submission) => isAcceptedSubmission(submission.statusDisplay))
    .slice(0, maxAccepted);
  const latest = sorted[0];

  if (latest && !selected.some((submission) => submission.id === latest.id)) {
    selected.push(latest);
  }

  return selected;
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

async function fetchSubmissionSummaries(cookie: string, slug: string) {
  const data = await graphql<SubmissionListData>({
    cookie,
    query: `
      query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
        submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
          submissions {
            id
            lang
            statusDisplay
            timestamp
          }
        }
      }
    `,
    variables: { offset: 0, limit: 50, questionSlug: slug },
  });

  return data.submissionList.submissions;
}

async function fetchSubmissionCodeViaGraphql(cookie: string, submissionId: string) {
  const data = await graphql<SubmissionDetailsData>({
    cookie,
    query: `
      query submissionDetails($submissionId: ID!) {
        submissionDetails(submissionId: $submissionId) {
          code
          lang
          statusDisplay
          timestamp
        }
      }
    `,
    variables: { submissionId },
  });

  return data.submissionDetails?.code ?? "";
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function extractCodeFromSubmissionHtml(html: string) {
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (nextDataMatch) {
    try {
      const payload = JSON.parse(nextDataMatch[1]) as unknown;
      const stack = [payload];

      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;

        for (const [key, value] of Object.entries(current)) {
          if (key === "code" && typeof value === "string") {
            return value;
          }

          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    } catch {
      // Fall through to regex-based extraction below.
    }
  }

  const codeMatch = html.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/);
  return codeMatch ? decodeJsonString(codeMatch[1]) : "";
}

async function fetchSubmissionCodeFromDetailPage(cookie: string, submissionId: string) {
  const response = await fetch(`https://leetcode.cn/submissions/detail/${submissionId}/`, {
    headers: {
      cookie,
      referer: "https://leetcode.cn/submissions/",
      "user-agent": "leetcode-review-planner/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`leetcode.cn submission detail returned HTTP ${response.status}`);
  }

  return extractCodeFromSubmissionHtml(await response.text());
}

async function fetchSubmissionCode(cookie: string, submissionId: string) {
  try {
    return await fetchSubmissionCodeViaGraphql(cookie, submissionId);
  } catch {
    return fetchSubmissionCodeFromDetailPage(cookie, submissionId);
  }
}

async function fetchSyncedSubmissions(cookie: string, summaries: LeetCodeSubmissionSummary[]) {
  const selected = selectSubmissionsForCodeSync(summaries);
  const submissions: SyncedLeetCodeSubmission[] = [];
  const errors: string[] = [];

  for (const summary of selected) {
    try {
      const code = await fetchSubmissionCode(cookie, summary.id);
      submissions.push({
        submissionId: summary.id,
        language: summary.lang ?? "",
        statusDisplay: summary.statusDisplay,
        isAccepted: isAcceptedSubmission(summary.statusDisplay),
        submittedAt: timestampToDate(summary.timestamp),
        code,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "submission code sync failed";
      errors.push(`${summary.id}: ${message}`);
    }
  }

  return { submissions, error: errors.join("; ") };
}

export async function syncLeetCodeCnProblems({
  cookie,
  problems,
  syncCode = true,
}: {
  cookie: string;
  problems: Problem[];
  syncCode?: boolean;
}): Promise<SyncedProblemStatus[]> {
  const results: SyncedProblemStatus[] = [];

  for (const problem of problems) {
    const accepted = await fetchQuestionStatus(cookie, problem.slug);
    const summaries = await fetchSubmissionSummaries(cookie, problem.slug);
    const metrics = calculateSubmissionMetrics(summaries);
    const codeResult = syncCode
      ? await fetchSyncedSubmissions(cookie, summaries)
      : { submissions: [], error: "" };

    results.push({
      problemId: problem.id,
      accepted,
      submissions: codeResult.submissions,
      codeSyncError: codeResult.error,
      ...metrics,
    });
  }

  return results;
}
