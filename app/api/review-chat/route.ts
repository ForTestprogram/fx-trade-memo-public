import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { getMonthlyLogs } from "@/lib/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "project-a97f801b-d61a-4463-988",
  location: "asia-northeast1",
});

const REVIEW_SYSTEM_PROMPT = `あなたはFXトレーダーの振り返りをサポートするコーチングAIです。
ユーザーの先月もしくは当月実施中のトレード記録を分析して、振り返りを行います。

【振り返りの会話の流れ】
1. 振り返り対象期間を判定する
   原則、月初の場合は前月分、月初の判定での振り返りでない場合は当月分の途中までの振り返りになる。わからない場合は確認する
2. 振り返り対象期間の過去の記録を分析してサマリーを伝える
   月初（1-3日)の場合は先月分、,それ以外の場合は当月分の記録を対象にする
3. 記録から経済イベントへの言及を抽出して提示する
4. 「他に印象に残ったイベントはありますか？」と聞く
5. うまくいったパターン・改善点を引き出す
6. 来月や残りの期間に向けての方針を聞く
7. 会話完了時にsaveMonthlyフィールドを追加して保存する

【コーチングの原則】
- 叱責しない・無理に頑張らせない
- 良かった点を必ず見つけて伝える

【返答形式】
返答は必ずJSON形式のみで返してください。
マークダウン、コードブロック、説明文は一切含めないでください。

通常の返答：
{"message":"ユーザーへのメッセージ","ui":{"type":"text_input","placeholder":"入力例"}}

選択肢がある場合：
{"message":"メッセージ","ui":{"type":"select","options":["選択肢1","選択肢2"]}}

振り返りが完了した場合：
{"message":"振り返りを保存しました！","ui":{"type":"text_input","placeholder":"何かあればどうぞ"},"saveMonthly":{"yearMonth":"2026-05","analysisText":"分析テキスト","summary":"サマリー2〜3文","economicEvents":[{"date":"2026-05-07","event":"FOMC会合"}],"highlights":["ハイライト1"]}}

uiのtypeは text_input / number_input / select のいずれか。`;

export async function POST(req: NextRequest) {
  try {
    const { messages, uid, yearMonth } = await req.json();

    // 当月のログと既存の振り返りを取得
    const db = getAdminDb();
    const [monthlyLogs, monthlyReviewSnap] = await Promise.all([
    getMonthlyLogs(uid, yearMonth),
    db.collection(`users/${uid}/monthlyReviews`)
      .orderBy("executedAt", "desc")
      .where("yearMonth", "==", yearMonth)
      .limit(1)
      .get(),
  ]);

const existingReview = monthlyReviewSnap.empty ? null : monthlyReviewSnap.docs[0].data();

    const logSummary = monthlyLogs.length === 0
      ? "記録なし"
      : monthlyLogs.map((log) => {
          const entries = log.entries?.map((e) => e.impression).filter(Boolean).join("／") ?? "所感なし";
          const pnlTotal = Object.values(log.pnl ?? {}).reduce((a, b) => a + b, 0);
          return `${log.date}：損益${pnlTotal}円、${entries}`;
        }).join("\n");
    
    
    const context = `対象月：${yearMonth}
    ${existingReview ? `既存の振り返り：${existingReview.summary}` : ""}
    当月の記録：
    ${logSummary}`;
    //console.log("context:", context);

    const systemPrompt = `${REVIEW_SYSTEM_PROMPT}\n\n【現在のコンテキスト】\n${context}`;

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
  }
}