// 左右两栏（编辑器 / 预览）的滚动同步。
//
// 两边内容高度不一样 —— 预览有标题样式、代码块配色、图片，同一段文字占的高度
// 和源码差很多。所以按「滚动比例」换算而不是按像素：一边滚到 30%，另一边也滚
// 到 30%。
//
// 抽成纯函数是为了能单测：除零、内容不足以滚动、比例越界这些边界最容易写错，
// 而滚动行为只能在真浏览器里手动试。

export type ScrollBox = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

// 一个框已经滚过的比例（0..1）。不足以滚动时返回 null —— 调用方应当什么都不做，
// 而不是把对方归零。
export function scrollRatio(box: ScrollBox): number | null {
  const max = box.scrollHeight - box.clientHeight;
  if (!Number.isFinite(max) || max <= 0) {
    return null;
  }
  const ratio = box.scrollTop / max;
  return Math.min(1, Math.max(0, ratio));
}

// 把比例换算成目标框的 scrollTop。目标不足以滚动时返回 null。
export function scrollTopForRatio(target: Omit<ScrollBox, "scrollTop">, ratio: number): number | null {
  const max = target.scrollHeight - target.clientHeight;
  if (!Number.isFinite(max) || max <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, ratio)) * max;
}

// 从一个框的滚动位置，算出另一个框应该滚到哪。任一边不能滚就返回 null。
export function syncedScrollTop(from: ScrollBox, to: Omit<ScrollBox, "scrollTop">): number | null {
  const ratio = scrollRatio(from);
  return ratio === null ? null : scrollTopForRatio(to, ratio);
}
