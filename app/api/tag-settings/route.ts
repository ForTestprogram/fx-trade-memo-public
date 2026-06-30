import { NextRequest, NextResponse } from "next/server";
import { getOrInitTagSettings } from "@/lib/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const settings = await getOrInitTagSettings();
    return NextResponse.json(settings);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { emotionTags, patternTags } = await req.json();
    const db = getAdminDb();
    await db.doc(`systemSettings/tagSettings`).set({ emotionTags, patternTags });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}