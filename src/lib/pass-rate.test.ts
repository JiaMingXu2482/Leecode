import { describe, expect, it } from "vitest";
import { normalizePassRate, resolvePassRate } from "./pass-rate";

describe("normalizePassRate", () => {
  it("接受 0-100 的整数", () => {
    for (const rate of [0, 1, 60, 99, 100]) {
      expect(normalizePassRate(rate), String(rate)).toEqual({ ok: true, value: rate });
    }
  });

  it("0 是有效值，不是「没填」", () => {
    expect(normalizePassRate(0)).toEqual({ ok: true, value: 0 });
  });

  it("接受数字字符串（输入框给的是字符串）", () => {
    expect(normalizePassRate("60")).toEqual({ ok: true, value: 60 });
    expect(normalizePassRate(" 85 ")).toEqual({ ok: true, value: 85 });
    expect(normalizePassRate("0")).toEqual({ ok: true, value: 0 });
  });

  it("小数四舍五入成整数", () => {
    expect(normalizePassRate(66.6)).toEqual({ ok: true, value: 67 });
    expect(normalizePassRate("33.3")).toEqual({ ok: true, value: 33 });
  });

  it("空字符串和 null 表示清空", () => {
    expect(normalizePassRate("")).toEqual({ ok: true, value: null });
    expect(normalizePassRate(null)).toEqual({ ok: true, value: null });
  });

  it("拒绝越界和垃圾输入", () => {
    for (const bad of [-1, 101, 120, NaN, Infinity, "abc", "60%", {}, [], true]) {
      expect(normalizePassRate(bad), JSON.stringify(bad)).toEqual({ ok: false });
    }
  });
});

describe("resolvePassRate", () => {
  it("请求里没带这个字段时保留原值", () => {
    expect(resolvePassRate(undefined, 60)).toEqual({ ok: true, value: 60 });
    expect(resolvePassRate(undefined, 0)).toEqual({ ok: true, value: 0 });
    expect(resolvePassRate(undefined, null)).toEqual({ ok: true, value: null });
  });

  it("带了新值就覆盖", () => {
    expect(resolvePassRate(80, 60)).toEqual({ ok: true, value: 80 });
    expect(resolvePassRate(0, 60)).toEqual({ ok: true, value: 0 });
  });

  it("明确清空会把原值抹掉", () => {
    expect(resolvePassRate(null, 60)).toEqual({ ok: true, value: null });
    expect(resolvePassRate("", 60)).toEqual({ ok: true, value: null });
  });

  it("非法值不会悄悄退回原值，而是报错", () => {
    expect(resolvePassRate(120, 60)).toEqual({ ok: false });
    expect(resolvePassRate("abc", 60)).toEqual({ ok: false });
  });
});
