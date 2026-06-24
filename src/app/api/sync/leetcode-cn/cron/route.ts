import { NextRequest, NextResponse } from "next/server";
import { runLeetCodeCnSync } from "@/lib/leetcode-sync-service";
import { verifySyncSecret } from "@/lib/sync-cron";

export async function POST(request: NextRequest) {
  if (!verifySyncSecret(new URL(request.url), process.env.SYNC_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLeetCodeCnSync({
      persistCookie: false,
      syncCode: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
