// 浮动面板（笔记助手）的位置/尺寸计算。抽成纯函数是为了能单测 —— 拖动和缩放
// 只能在真实浏览器里手动试，而这类边界（拖出屏幕、缩到负数）恰恰最容易写错。

export type PanelBox = { x: number; y: number; w: number; h: number };
export type Viewport = { width: number; height: number };

// 离视口边缘至少留这么多，免得窗口被拖到只剩一条边、再也抓不回来。
export const EDGE_MARGIN = 4;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 260;

// 拖动：保持尺寸不变，把左上角限制在视口内。
export function boxAfterDrag(
  pointer: { x: number; y: number },
  grab: { dx: number; dy: number },
  size: { w: number; h: number },
  viewport: Viewport,
): PanelBox {
  const maxX = Math.max(EDGE_MARGIN, viewport.width - size.w - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, viewport.height - size.h - EDGE_MARGIN);
  return {
    x: Math.max(EDGE_MARGIN, Math.min(maxX, pointer.x - grab.dx)),
    y: Math.max(EDGE_MARGIN, Math.min(maxY, pointer.y - grab.dy)),
    w: size.w,
    h: size.h,
  };
}

// 缩放：左上角钉住，右下角跟着指针，夹在最小尺寸和视口之间。
export function boxAfterResize(
  pointer: { x: number; y: number },
  origin: { x: number; y: number },
  viewport: Viewport,
): PanelBox {
  return {
    x: origin.x,
    y: origin.y,
    w: Math.max(MIN_WIDTH, Math.min(viewport.width - origin.x - EDGE_MARGIN, pointer.x - origin.x)),
    h: Math.max(
      MIN_HEIGHT,
      Math.min(viewport.height - origin.y - EDGE_MARGIN, pointer.y - origin.y),
    ),
  };
}

export function isPanelBox(value: unknown): value is PanelBox {
  if (!value || typeof value !== "object") {
    return false;
  }
  const box = value as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (key) => typeof box[key] === "number" && Number.isFinite(box[key]),
  );
}
