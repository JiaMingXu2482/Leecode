import { describe, expect, it } from "vitest";
import { boxAfterDrag, boxAfterResize, EDGE_MARGIN, isPanelBox, MIN_HEIGHT, MIN_WIDTH } from "./panel-box";

const VIEWPORT = { width: 1440, height: 900 };
const SIZE = { w: 480, h: 544 };

describe("boxAfterDrag", () => {
  it("跟着指针走，尺寸不变", () => {
    // 落点要在视口内才不会被夹：544 高的面板在 900 高的视口里，y 最多 352。
    const box = boxAfterDrag({ x: 700, y: 300 }, { dx: 100, dy: 20 }, SIZE, VIEWPORT);
    expect(box).toEqual({ x: 600, y: 280, w: 480, h: 544 });
  });

  it("面板底部会被视口下沿挡住时，y 被夹到刚好贴边", () => {
    const box = boxAfterDrag({ x: 700, y: 400 }, { dx: 100, dy: 20 }, SIZE, VIEWPORT);
    expect(box.y).toBe(VIEWPORT.height - SIZE.h - EDGE_MARGIN);
  });

  it("拖到左上角外面会被拉回来", () => {
    const box = boxAfterDrag({ x: -500, y: -500 }, { dx: 0, dy: 0 }, SIZE, VIEWPORT);
    expect(box.x).toBe(EDGE_MARGIN);
    expect(box.y).toBe(EDGE_MARGIN);
  });

  it("拖到右下角外面也会被拉回来，整个窗口仍在视口里", () => {
    const box = boxAfterDrag({ x: 9999, y: 9999 }, { dx: 0, dy: 0 }, SIZE, VIEWPORT);
    expect(box.x + box.w).toBeLessThanOrEqual(VIEWPORT.width);
    expect(box.y + box.h).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("窗口比视口还大时，至少保证左上角可见（不会算出负坐标）", () => {
    const box = boxAfterDrag({ x: 0, y: 0 }, { dx: 0, dy: 0 }, { w: 2000, h: 2000 }, VIEWPORT);
    expect(box.x).toBe(EDGE_MARGIN);
    expect(box.y).toBe(EDGE_MARGIN);
  });
});

describe("boxAfterResize", () => {
  it("左上角钉住，右下角跟指针", () => {
    const box = boxAfterResize({ x: 900, y: 700 }, { x: 300, y: 200 }, VIEWPORT);
    expect(box).toEqual({ x: 300, y: 200, w: 600, h: 500 });
  });

  it("不会小于最小尺寸", () => {
    const box = boxAfterResize({ x: 310, y: 210 }, { x: 300, y: 200 }, VIEWPORT);
    expect(box.w).toBe(MIN_WIDTH);
    expect(box.h).toBe(MIN_HEIGHT);
  });

  it("往回拖过头也不会出现负尺寸", () => {
    const box = boxAfterResize({ x: -9999, y: -9999 }, { x: 300, y: 200 }, VIEWPORT);
    expect(box.w).toBe(MIN_WIDTH);
    expect(box.h).toBe(MIN_HEIGHT);
  });

  it("不会超出视口右下边界", () => {
    const box = boxAfterResize({ x: 9999, y: 9999 }, { x: 300, y: 200 }, VIEWPORT);
    expect(box.x + box.w).toBeLessThanOrEqual(VIEWPORT.width);
    expect(box.y + box.h).toBeLessThanOrEqual(VIEWPORT.height);
  });
});

describe("isPanelBox", () => {
  it("认得出合法的几何数据", () => {
    expect(isPanelBox({ x: 1, y: 2, w: 3, h: 4 })).toBe(true);
  });

  it("挡掉 localStorage 里的脏数据", () => {
    for (const bad of [null, undefined, {}, { x: 1 }, { x: 1, y: 2, w: 3 }, { x: "1", y: 2, w: 3, h: 4 }, { x: NaN, y: 2, w: 3, h: 4 }, "box", 42]) {
      expect(isPanelBox(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
