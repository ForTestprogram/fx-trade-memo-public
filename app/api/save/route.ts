import { NextRequest, NextResponse } from "next/server";
import { saveDailyLog } from "@/lib/firestore";
import { getJstTradingDate } from "@/lib/dateUtils";

export async function POST(req: NextRequest) {
  try {
    const { uid, save, recordDate, messages } = await req.json();
    const date = recordDate ?? getJstTradingDate();

    await saveDailyLog(
      uid,
      date,
      save.pnl ?? {},
      {
        impression: save.impression ?? "",
        strategy: save.strategy ?? "",
        tags: save.tags ?? { emotion: [], pattern: [] },
        chatLog: messages ?? [],
      }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}