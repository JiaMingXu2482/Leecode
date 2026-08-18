// 从剪贴板/拖放事件里取出图片并上传，返回可以插进 Markdown 的一行。
// 抽成纯函数是为了能单测 —— 粘贴这种行为只能在真浏览器里手动试，
// 而「哪些 item 算图片」「失败怎么反馈」恰恰最容易写错。

export type UploadResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

// 剪贴板里一次粘贴可能同时带 text/html、image/png 等多份数据。只挑图片，
// 且只取第一张 —— 截图工具通常就给一张。
export function imageFilesFrom(items: readonly DataTransferItem[]): File[] {
  const files: File[] = [];
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return files;
}

export async function uploadNoteImage(
  file: File,
  post: (file: File) => Promise<Response>,
): Promise<UploadResult> {
  let response: Response;
  try {
    response = await post(file);
  } catch {
    return { ok: false, error: "图片上传失败：网络错误" };
  }
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    return { ok: false, error: payload.error ?? `图片上传失败 (${response.status})` };
  }
  // alt 用文件名（截图一般是 image.png 这种），没有就留空
  const alt = (file.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  return { ok: true, markdown: `![${alt}](${payload.url})` };
}
