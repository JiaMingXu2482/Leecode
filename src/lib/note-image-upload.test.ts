import { describe, expect, it, vi } from "vitest";
import { imageFilesFrom, uploadNoteImage } from "./note-image-upload";

function item(kind: string, type: string, file: File | null = null): DataTransferItem {
  return { kind, type, getAsFile: () => file } as unknown as DataTransferItem;
}

const png = new File([new Uint8Array([1, 2, 3])], "screenshot.png", { type: "image/png" });

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("imageFilesFrom", () => {
  it("只挑出图片文件", () => {
    const items = [
      item("string", "text/plain"),
      item("string", "text/html"),
      item("file", "image/png", png),
    ];
    expect(imageFilesFrom(items)).toEqual([png]);
  });

  it("忽略非图片的文件（比如拖进来一个 pdf）", () => {
    const pdf = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    expect(imageFilesFrom([item("file", "application/pdf", pdf)])).toEqual([]);
  });

  it("粘贴纯文本时没有图片", () => {
    expect(imageFilesFrom([item("string", "text/plain")])).toEqual([]);
  });

  it("getAsFile 返回 null 时跳过，不会塞进 null", () => {
    expect(imageFilesFrom([item("file", "image/png", null)])).toEqual([]);
  });
});

describe("uploadNoteImage", () => {
  it("成功后返回可直接插入的 Markdown", async () => {
    const result = await uploadNoteImage(png, async () =>
      jsonResponse({ id: "abc", url: "/api/note-images/abc" }),
    );
    expect(result).toEqual({ ok: true, markdown: "![screenshot](/api/note-images/abc)" });
  });

  it("alt 去掉扩展名", async () => {
    const file = new File([new Uint8Array([1])], "邻接表.png", { type: "image/png" });
    const result = await uploadNoteImage(file, async () => jsonResponse({ url: "/api/note-images/x" }));
    expect(result).toEqual({ ok: true, markdown: "![邻接表](/api/note-images/x)" });
  });

  it("服务端报错时把原因带回来", async () => {
    const result = await uploadNoteImage(png, async () =>
      jsonResponse({ error: "图片 12.0MB，超过 8MB 上限" }, 413),
    );
    expect(result).toEqual({ ok: false, error: "图片 12.0MB，超过 8MB 上限" });
  });

  it("服务端没给 error 时也有兜底文案", async () => {
    const result = await uploadNoteImage(png, async () => jsonResponse({}, 500));
    expect(result).toEqual({ ok: false, error: "图片上传失败 (500)" });
  });

  it("200 但没返回 url 也算失败，不会插入坏链接", async () => {
    const result = await uploadNoteImage(png, async () => jsonResponse({ id: "abc" }));
    expect(result.ok).toBe(false);
  });

  it("网络异常不抛到调用方", async () => {
    const result = await uploadNoteImage(png, async () => {
      throw new Error("offline");
    });
    expect(result).toEqual({ ok: false, error: "图片上传失败：网络错误" });
  });

  it("每张图只 POST 一次", async () => {
    const post = vi.fn(async () => jsonResponse({ url: "/api/note-images/x" }));
    await uploadNoteImage(png, post);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
