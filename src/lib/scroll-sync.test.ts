import { describe, expect, it } from "vitest";
import { scrollRatio, scrollTopForRatio, syncedScrollTop } from "./scroll-sync";

describe("scrollRatio", () => {
  it("滚到一半是 0.5", () => {
    expect(scrollRatio({ scrollTop: 250, scrollHeight: 1000, clientHeight: 500 })).toBe(0.5);
  });

  it("顶部是 0，底部是 1", () => {
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
    expect(scrollRatio({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 })).toBe(1);
  });

  it("内容不足以滚动时返回 null，而不是除零", () => {
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 400, clientHeight: 500 })).toBeNull();
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 })).toBeNull();
  });

  it("超出范围的 scrollTop 被钳到 0..1（橡皮筋滚动会出现）", () => {
    expect(scrollRatio({ scrollTop: -50, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
    expect(scrollRatio({ scrollTop: 9999, scrollHeight: 1000, clientHeight: 500 })).toBe(1);
  });
});

describe("scrollTopForRatio", () => {
  it("按比例换算成像素", () => {
    expect(scrollTopForRatio({ scrollHeight: 3000, clientHeight: 1000 }, 0.5)).toBe(1000);
  });

  it("目标不能滚动时返回 null", () => {
    expect(scrollTopForRatio({ scrollHeight: 800, clientHeight: 1000 }, 0.5)).toBeNull();
  });
});

describe("syncedScrollTop", () => {
  it("两边高度不同也按比例对齐", () => {
    // 左边可滚 500，右边可滚 2000；左边滚到 50% → 右边 1000
    const left = { scrollTop: 250, scrollHeight: 1000, clientHeight: 500 };
    const right = { scrollHeight: 3000, clientHeight: 1000 };
    expect(syncedScrollTop(left, right)).toBe(1000);
  });

  it("来源不能滚动就不动对方", () => {
    expect(
      syncedScrollTop(
        { scrollTop: 0, scrollHeight: 100, clientHeight: 500 },
        { scrollHeight: 3000, clientHeight: 1000 },
      ),
    ).toBeNull();
  });

  it("目标不能滚动也返回 null", () => {
    expect(
      syncedScrollTop(
        { scrollTop: 250, scrollHeight: 1000, clientHeight: 500 },
        { scrollHeight: 100, clientHeight: 1000 },
      ),
    ).toBeNull();
  });

  it("来回换算能回到原位（不会越同步越偏）", () => {
    const left = { scrollTop: 137, scrollHeight: 1000, clientHeight: 500 };
    const right = { scrollHeight: 3000, clientHeight: 1000 };
    const rightTop = syncedScrollTop(left, right)!;
    const back = syncedScrollTop({ ...right, scrollTop: rightTop }, left);
    expect(back).toBeCloseTo(left.scrollTop, 6);
  });
});
