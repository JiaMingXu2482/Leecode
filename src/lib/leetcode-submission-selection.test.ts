import { describe, expect, it } from "vitest";
import { selectSubmissionsForCodeSync } from "./leetcode-cn-sync";

describe("selectSubmissionsForCodeSync", () => {
  it("keeps recent accepted submissions first and also keeps the latest non-accepted submission", () => {
    const selected = selectSubmissionsForCodeSync(
      [
        { id: "latest-wa", statusDisplay: "Wrong Answer", timestamp: "1782003000", lang: "typescript" },
        { id: "ac-3", statusDisplay: "Accepted", timestamp: "1782002000", lang: "typescript" },
        { id: "ac-2", statusDisplay: "通过", timestamp: "1782001000", lang: "typescript" },
        { id: "ac-1", statusDisplay: "Accepted", timestamp: "1782000000", lang: "typescript" },
      ],
      { maxAccepted: 2 },
    );

    expect(selected.map((submission) => submission.id)).toEqual(["ac-3", "ac-2", "latest-wa"]);
  });

  it("does not duplicate the latest submission when it is already an accepted selection", () => {
    const selected = selectSubmissionsForCodeSync(
      [
        { id: "latest-ac", statusDisplay: "Accepted", timestamp: "1782003000", lang: "cpp" },
        { id: "older-wa", statusDisplay: "Wrong Answer", timestamp: "1782002000", lang: "cpp" },
      ],
      { maxAccepted: 2 },
    );

    expect(selected.map((submission) => submission.id)).toEqual(["latest-ac"]);
  });
});
