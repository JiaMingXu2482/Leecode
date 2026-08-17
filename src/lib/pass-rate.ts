// 判题机通过率（0-100 的整数百分比），手动填。机考是部分给分，「思路对但只过
// 60%」和「一次全过」是两回事，反馈分分不出来这个差别。
//
// 三种输入必须区分开，混了就会丢数据或误清数据：
//   undefined  = 请求里没带这个字段 → 沿用原值
//   null / ""  = 用户明确清空       → 写 null
//   0          = 用户填了 0（一个用例都没过）→ 写 0，不能当成"没填"

export type PassRateResult = { ok: true; value: number | null } | { ok: false };

export function normalizePassRate(value: unknown): PassRateResult {
  if (value === null || value === "") {
    return { ok: true, value: null };
  }
  const rate = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(rate) };
}

// 决定最终要写进库的值：没带字段就保留原值，带了就用新值。
export function resolvePassRate(
  incoming: unknown,
  existing: number | null | undefined,
): { ok: true; value: number | null } | { ok: false } {
  if (typeof incoming === "undefined") {
    return { ok: true, value: existing ?? null };
  }
  return normalizePassRate(incoming);
}
