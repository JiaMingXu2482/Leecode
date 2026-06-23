import { describe, expect, it } from "vitest";
import { calculateSubmissionMetrics } from "./leetcode-cn-sync";

describe("calculateSubmissionMetrics", () => {
  it("calculates submission count, accepted count, accepted rate, and latest timestamps", () => {
    const metrics = calculateSubmissionMetrics([
      { statusDisplay: "Wrong Answer", timestamp: "1782000000" },
      { statusDisplay: "Accepted", timestamp: "1782000600" },
      { statusDisplay: "通过", timestamp: "1782001200" },
    ]);

    expect(metrics.totalSubmissions).toBe(3);
    expect(metrics.acceptedSubmissions).toBe(2);
    expect(metrics.acceptedRate).toBe(67);
    expect(metrics.lastSubmittedAt?.toISOString()).toBe("2026-06-21T00:20:00.000Z");
    expect(metrics.lastAcceptedAt?.toISOString()).toBe("2026-06-21T00:20:00.000Z");
  });

  it("returns zero metrics for problems without visible submissions", () => {
    const metrics = calculateSubmissionMetrics([]);

    expect(metrics.totalSubmissions).toBe(0);
    expect(metrics.acceptedSubmissions).toBe(0);
    expect(metrics.acceptedRate).toBe(0);
    expect(metrics.lastSubmittedAt).toBeNull();
    expect(metrics.lastAcceptedAt).toBeNull();
  });
});
