import { describe, expect, it } from "vitest";
import { filterAcmNotes, isAcmNoteCategory } from "./acm-note-shared";

const notes = [
  { title: "输入骨架 · 5 种常见格式", category: "输入输出", content: "cin.ignore(); getline(cin, s);" },
  { title: "cin >> 和 getline 怎么选", category: "输入输出", content: "看单个字段内部有没有空格" },
  { title: "cmp 黄金法则", category: "排序比较", content: "相等时必须返回 false，否则 RE" },
  { title: "容器速查", category: "容器", content: "vector / map / unordered_map" },
];

describe("filterAcmNotes", () => {
  it("returns everything when there is no query and no category", () => {
    expect(filterAcmNotes(notes, "", "")).toHaveLength(4);
  });

  it("matches the title", () => {
    const hit = filterAcmNotes(notes, "黄金法则", "");
    expect(hit.map((n) => n.title)).toEqual(["cmp 黄金法则"]);
  });

  it("matches the content, not just the title", () => {
    // "getline" appears in note 1's content and note 2's title.
    const hit = filterAcmNotes(notes, "getline", "");
    expect(hit).toHaveLength(2);
    expect(hit[0].title).toContain("输入骨架");
  });

  it("is case-insensitive and trims the query", () => {
    expect(filterAcmNotes(notes, "  GETLINE  ", "")).toHaveLength(2);
    expect(filterAcmNotes(notes, "VECTOR", "")).toHaveLength(1);
  });

  it("filters by category", () => {
    expect(filterAcmNotes(notes, "", "输入输出")).toHaveLength(2);
    expect(filterAcmNotes(notes, "", "容器")).toHaveLength(1);
  });

  it("combines category and query", () => {
    // getline hits two notes, but only one is also in 排序比较 (none).
    expect(filterAcmNotes(notes, "getline", "排序比较")).toHaveLength(0);
    expect(filterAcmNotes(notes, "空格", "输入输出")).toHaveLength(1);
  });

  it("returns nothing for a query that matches no note", () => {
    expect(filterAcmNotes(notes, "python", "")).toHaveLength(0);
  });
});

describe("isAcmNoteCategory", () => {
  it("accepts the known categories", () => {
    expect(isAcmNoteCategory("输入输出")).toBe(true);
    expect(isAcmNoteCategory("踩坑")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAcmNoteCategory("随便写的")).toBe(false);
    expect(isAcmNoteCategory("")).toBe(false);
    expect(isAcmNoteCategory(42)).toBe(false);
    expect(isAcmNoteCategory(null)).toBe(false);
  });
});
