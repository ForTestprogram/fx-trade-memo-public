import { NextRequest, NextResponse } from "next/server";
import { getMonthlyLogs, getExchangeRates } from "@/lib/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    const yearMonth = searchParams.get("yearMonth");
    const pair = searchParams.get("pair");
    const executedAt = searchParams.get("executedAt");

    if (!uid || !yearMonth) {
      return NextResponse.json({ error: "uid and yearMonth are required" }, { status: 400 });
    }

    const fromDate = `${yearMonth}-01`;
    const toDate = `${yearMonth}-31`;

    const db = getAdminDb();

    let monthlyReviewQuery = db.collection(`users/${uid}/monthlyReviews`).orderBy("executedAt", "desc");
    if (executedAt) {
      monthlyReviewQuery = db.collection(`users/${uid}/monthlyReviews`).where("executedAt", "==", executedAt);
    } else {
      monthlyReviewQuery = monthlyReviewQuery.where("yearMonth", "==", yearMonth).limit(1);
    }

    const [dailyLogs, monthlyReviewSnap, exchangeRates] = await Promise.all([
      getMonthlyLogs(uid, yearMonth),
      monthlyReviewQuery.get(),
      pair ? getExchangeRates(pair, fromDate, toDate) : Promise.resolve([]),
    ]);

    const monthlyReview = monthlyReviewSnap.empty ? null : monthlyReviewSnap.docs[0].data();
    return NextResponse.json({ dailyLogs, monthlyReview, exchangeRates });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}