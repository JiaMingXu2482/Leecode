import { describe, expect, it } from "vitest";
import { verifySyncSecret } from "./sync-cron";

describe("verifySyncSecret", () => {
  it("accepts the configured sync secret from the request URL", () => {
    expect(verifySyncSecret(new URL("https://example.com/api/sync?secret=abc"), "abc")).toBe(true);
  });

  it("rejects missing or incorrect sync secrets", () => {
    expect(verifySyncSecret(new URL("https://example.com/api/sync"), "abc")).toBe(false);
    expect(verifySyncSecret(new URL("https://example.com/api/sync?secret=wrong"), "abc")).toBe(false);
  });

  it("rejects cron calls when no server secret is configured", () => {
    expect(verifySyncSecret(new URL("https://example.com/api/sync?secret=abc"), "")).toBe(false);
  });
});
