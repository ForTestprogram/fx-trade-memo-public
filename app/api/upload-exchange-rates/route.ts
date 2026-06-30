import { NextRequest, NextResponse } from "next/server";
import { saveExchangeRates } from "@/lib/firestore";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const pair = formData.get("pair") as string;
    const category = pair.includes("JPY") ? "JPY" : "OTHER";

    if (!file || !pair) {
      return NextResponse.json({ error: "file and pair are required" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    // 1, 2行目はヘッダーなのでスキップ
    const dataLines = lines.slice(2);

    const rates = dataLines.map((line) => {
      const cols = line.split(",");
      const [y, m, d] = cols[0].split("/");
      const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      return {
        date,
        high: parseFloat(cols[2]),
        low: parseFloat(cols[3]),
        close: parseFloat(cols[4]),
      };
    }).filter((r) => r.date && !isNaN(r.high) && !isNaN(r.low) && !isNaN(r.close));

    await saveExchangeRates(category, pair, rates);

    return NextResponse.json({ ok: true, count: rates.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
  }
}