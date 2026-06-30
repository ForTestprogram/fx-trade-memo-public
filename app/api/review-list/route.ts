import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid is required" }, { status: 400 });

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    jst.setFullYear(jst.getFullYear() - 1);
    const fromDate = jst.toISOString().slice(0, 10);

    const db = getAdminDb();
    const snapshot = await db
      .collection(`users/${uid}/monthlyReviews`)
      .orderBy("executedAt", "desc")
      .where("executedAt", ">=", fromDate)
      .get();

    const reviews = snapshot.docs.map((d) => ({
      executedAt: d.data().executedAt,
      yearMonth: d.data().yearMonth,
    }));

    return NextResponse.json({ reviews });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}