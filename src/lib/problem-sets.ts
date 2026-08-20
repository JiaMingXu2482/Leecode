import {
  CODEFUN_ID_BASE,
  CODEFUN_TOPIC_GROUPS,
  codefunDisplayId,
  isCodefunFrontendId,
} from "@/lib/codefun-problems";
import {
  NOWCODER_ID_BASE,
  NOWCODER_TOPIC_GROUPS,
  isNowcoderFrontendId,
} from "@/lib/nowcoder-problems";
import { TOPIC_GROUPS } from "@/lib/topics";

// 三个题库合成一张表。以前只有 Hot100 的分类树是「一等公民」：优先类别只认
// Hot100 分类名、整类不刷也只在 Hot100 里找，而每日新题其实全部来自华为题单和
// 牛客 —— 于是「把 DFS(图论) 设为优先」会被静默丢掉。这里统一。

export type ProblemSource = "CODEFUN" | "NOWCODER" | "LEETCODE";

export const SOURCE_LABEL: Record<ProblemSource, string> = {
  CODEFUN: "华为题单",
  NOWCODER: "牛客华为机试",
  LEETCODE: "LeetCode Hot100",
};

export type SourceGroup = {
  source: ProblemSource;
  name: string;
  // 真正的 frontendId（已经加过各题库的 ID_BASE）
  frontendIds: number[];
};

export const ALL_TOPIC_GROUPS: SourceGroup[] = [
  ...CODEFUN_TOPIC_GROUPS.map((group) => ({
    source: "CODEFUN" as const,
    name: group.name,
    frontendIds: group.ids.map((id) => CODEFUN_ID_BASE + id),
  })),
  ...NOWCODER_TOPIC_GROUPS.map((group) => ({
    source: "NOWCODER" as const,
    name: group.name,
    frontendIds: group.ids.map((id) => NOWCODER_ID_BASE + id),
  })),
  ...TOPIC_GROUPS.map((group) => ({
    source: "LEETCODE" as const,
    name: group.name,
    frontendIds: [...group.ids],
  })),
];

// 分类名在三个题库之间会重名（「动态规划」三家都有，「栈」两家有）。
export const ALL_CATEGORY_NAMES = new Set(ALL_TOPIC_GROUPS.map((group) => group.name));

export function groupsNamed(name: string): SourceGroup[] {
  return ALL_TOPIC_GROUPS.filter((group) => group.name === name);
}

export function sourceOfFrontendId(frontendId: number): ProblemSource {
  if (isCodefunFrontendId(frontendId)) return "CODEFUN";
  if (isNowcoderFrontendId(frontendId)) return "NOWCODER";
  return "LEETCODE";
}

// 界面和对话里显示的题号："P4520" / "HJ14" / "#42"
export function problemLabel(frontendId: number): string {
  if (isCodefunFrontendId(frontendId)) {
    return codefunDisplayId(frontendId - CODEFUN_ID_BASE);
  }
  if (isNowcoderFrontendId(frontendId)) {
    return `HJ${frontendId - NOWCODER_ID_BASE}`;
  }
  return `#${frontendId}`;
}

// 把用户/模型写的题号解析成 frontendId。接受 "P4520"、"HJ14"、"#42"、"42"，
// 也接受已经是 frontendId 的数字（24520）。认不出来返回 null。
export function resolveProblemRef(ref: unknown): number | null {
  if (typeof ref === "number" && Number.isFinite(ref)) {
    return Math.floor(ref);
  }
  if (typeof ref !== "string") {
    return null;
  }
  const text = ref.trim().toUpperCase();
  let match = text.match(/^P(\d{1,4})$/);
  if (match) {
    return CODEFUN_ID_BASE + Number(match[1]);
  }
  match = text.match(/^HJ(\d{1,3})$/);
  if (match) {
    return NOWCODER_ID_BASE + Number(match[1]);
  }
  match = text.match(/^#?(\d{1,5})$/);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

// 给助手的系统提示用：每个题库有哪些分类。
export function renderCategoryCatalogue(): string {
  const bySource = new Map<ProblemSource, string[]>();
  for (const group of ALL_TOPIC_GROUPS) {
    const list = bySource.get(group.source);
    if (list) {
      list.push(`${group.name}(${group.frontendIds.length})`);
    } else {
      bySource.set(group.source, [`${group.name}(${group.frontendIds.length})`]);
    }
  }
  return [...bySource.entries()]
    .map(([source, names]) => `${SOURCE_LABEL[source]}: ${names.join("、")}`)
    .join("\n");
}
