// 笔记里图片的显示宽度。
//
// Markdown 的图片语法 ![alt](url) 存不下尺寸，toast-ui 的 image 节点也只有
// imageUrl / altText / rawHTML 三个属性，没有宽高。所以把宽度编码进 URL 的
// query：/api/note-images/abc?w=400。
//
// 这样做的好处是尺寸跟着 Markdown 走 —— 编辑器、今日任务、历史笔记三处渲染
// 读的是同一份数据，不需要额外的表或字段。图片接口按路径参数取 id，多出来的
// query 会被忽略，不影响取图。

// 点击图片时在这几档之间循环。null = 原始大小。
export const IMAGE_WIDTHS: (number | null)[] = [240, 400, 640, null];

export function parseImageWidth(url: string): number | null {
  const match = url.match(/[?&]w=(\d{2,4})(?:&|$)/);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  return Number.isFinite(width) && width > 0 ? width : null;
}

export function withImageWidth(url: string, width: number | null): string {
  // 先摘掉原有的 w=，避免叠加成 ?w=240&w=400
  const stripped = url
    .replace(/([?&])w=\d+(&|$)/, (_full, lead: string, tail: string) =>
      tail === "&" ? lead : lead === "?" ? "" : "",
    )
    .replace(/[?&]$/, "");
  if (width === null) {
    return stripped;
  }
  return `${stripped}${stripped.includes("?") ? "&" : "?"}w=${width}`;
}

// 点一下切到下一档
export function nextImageWidth(url: string): number | null {
  const current = parseImageWidth(url);
  const index = IMAGE_WIDTHS.findIndex((width) => width === current);
  return IMAGE_WIDTHS[(index + 1) % IMAGE_WIDTHS.length];
}
