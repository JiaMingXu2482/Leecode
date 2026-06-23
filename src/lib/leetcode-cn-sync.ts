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
    submissions: {
      statusDisplay: string;
      timestamp: string;
    }[];
  };
};

export type SyncedProblemStatus = {
  problemId: string;
  accepted: boolean;
  lastAcceptedAt: Date | null;
};

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

async function fetchLastAcceptedAt(cookie: string, slug: string) {
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
    variables: { offset: 0, limit: 20, questionSlug: slug },
  });

  const accepted = data.submissionList.submissions.find(
    (submission) => submission.statusDisplay === "Accepted" || submission.statusDisplay === "通过",
  );

  return accepted ? new Date(Number(accepted.timestamp) * 1000) : null;
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
    const lastAcceptedAt = accepted ? await fetchLastAcceptedAt(cookie, problem.slug) : null;

    results.push({
      problemId: problem.id,
      accepted,
      lastAcceptedAt,
    });
  }

  return results;
}
