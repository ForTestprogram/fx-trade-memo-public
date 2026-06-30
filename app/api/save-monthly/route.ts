import { NextRequest, NextResponse } from "next/server";
import { saveMonthlyReview } from "@/lib/firestore";

export async function POST(req: NextRequest) {
  try {
    const { uid, saveMonthly } = await req.json();
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const executedAt = jst.toISOString().replace("Z", "+09:00");

    await saveMonthlyReview(uid, {
      yearMonth: saveMonthly.yearMonth,
      analysisText: saveMonthly.analysisText ?? "",
      summary: saveMonthly.summary ?? "",
      economicEvents: saveMonthly.economicEvents ?? [],
      highlights: saveMonthly.highlights ?? [],
      executedAt,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}