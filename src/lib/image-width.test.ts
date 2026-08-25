import { describe, expect, it } from "vitest";
import { nextImageWidth, parseImageWidth, withImageWidth } from "./image-width";

const URL = "/api/note-images/abc";

describe("parseImageWidth", () => {
  it("读出 w 参数", () => {
    expect(parseImageWidth(`${URL}?w=400`)).toBe(400);
  });

  it("没有 w 就是原始大小", () => {
    expect(parseImageWidth(URL)).toBeNull();
    expect(parseImageWidth(`${URL}?x=1`)).toBeNull();
  });

  it("w 在其它参数中间也能读到", () => {
    expect(parseImageWidth(`${URL}?a=1&w=240&b=2`)).toBe(240);
  });
});

describe("withImageWidth", () => {
  it("加上宽度", () => {
    expect(withImageWidth(URL, 400)).toBe(`${URL}?w=400`);
  });

  it("替换已有宽度，不会叠加", () => {
    expect(withImageWidth(`${URL}?w=240`, 400)).toBe(`${URL}?w=400`);
    expect(parseImageWidth(withImageWidth(`${URL}?w=240`, 400))).toBe(400);
  });

  it("传 null 去掉宽度，且不留下多余的 ? 或 &", () => {
    expect(withImageWidth(`${URL}?w=240`, null)).toBe(URL);
    expect(withImageWidth(`${URL}?a=1&w=240`, null)).toBe(`${URL}?a=1`);
  });

  it("保留其它参数", () => {
    expect(withImageWidth(`${URL}?a=1`, 640)).toBe(`${URL}?a=1&w=640`);
  });
});

describe("nextImageWidth", () => {
  it("按档位循环：原始 → 240 → 400 → 640 → 原始", () => {
    expect(nextImageWidth(URL)).toBe(240);
    expect(nextImageWidth(`${URL}?w=240`)).toBe(400);
    expect(nextImageWidth(`${URL}?w=400`)).toBe(640);
    expect(nextImageWidth(`${URL}?w=640`)).toBeNull();
  });

  it("档位外的宽度当成原始，从头开始", () => {
    expect(nextImageWidth(`${URL}?w=999`)).toBe(240);
  });
});
