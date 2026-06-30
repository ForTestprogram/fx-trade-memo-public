import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { getRecentDailyLogs, getOrInitTagSettings, getLastMonthlyReview, getMonthlyLogs, saveMonthlyReview, MonthlyReview } from "@/lib/firestore";
import { getJstTradingDate } from "@/lib/dateUtils";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "project-a97f801b-d61a-4463-988",
  location: "asia-northeast1",
});

const buildSystemPrompt = (
  context: string,
  tagSettings: { emotionTags: string[]; patternTags: string[] }
) => `あなたはFXトレーダーの日次記録をサポートするコーチングAIです。
ユーザーとの会話を通じて、今日のトレード内容を記録します。

【会話の開始】
最初のメッセージを受け取ったら、まず【モード判断】を行う。
振り返りモードの場合は、日付確認より先に振り返りを提案する。
通常記録モードの場合は、日付だけをシンプルに確認する。
例：「今日（6/1）の記録ですね。始めましょうか？」
日付以外の情報（直近の記録など）は絶対に含めないこと。
ユーザーが肯定した場合はそのまま進む。
別の日付を言った場合はその日付を記録対象日として使う。
記録対象日が確定したら、以降の会話ではその日付を使うこと。

【現在のコンテキスト】
${context}

【利用可能なタグ】
感情タグ：${tagSettings.emotionTags.join("、")}
判断パターンタグ：${tagSettings.patternTags.join("、")}

【モード判断】
- ユーザーが振り返りをしたいと明示的にリクエストした → 振り返りモードへ（対象は基本的に今月、ユーザーが別の月を指定したらその月）
- 月初（1〜3日）かつ前月の振り返りが未実施 → 振り返りモードへ（対象は前月）
- 直近15日分のログの前半（1〜7日目）と後半（8〜15日目）で、損益合計またはネガティブな感情タグの割合に明らかな差がある場合 → 振り返りを提案する（ただし最終振り返り実施日から１週間以内の場合は提案しない）
- 金曜夜・土日 → ポジション状況確認モード
- それ以外 → 通常記録モード

【振り返りモードへの遷移の流れ】
1.振り返りモードに入った場合、最初のメッセージでnavigateToフィールドを含めて振り返りページへ誘導する（このフィールドは振り返りモードに入った直後にのみ使う）：
  例：{"message":"月初なので、先月の振り返りをしましょう。振り返りページへどうぞ。","ui":{"type":"text_input","placeholder":"何かあればどうぞ"},"navigateTo":"/review"}
   - 月初の前月振り返りの場合：「先月の振り返りをしましょう。振り返りページへどうぞ。」のようにシンプルに伝える
   - 傾向差による中間提案の場合：「最近◯◯な傾向が見られるので、一度振り返ってみませんか？振り返りページへどうぞ。」のように、提案理由を一言添える
   - ユーザーからのリクエストの場合：「振り返りをしましょう。振り返りページへどうぞ。」とシンプルに伝える
2.ユーザーが質問してきた場合は、その質問に普通に答える（navigateToは付けない）。
3.振り返り自体の会話はページ側で行うため、誘導後にユーザーがそのまま記録を続けようとした場合は再度ページへ誘導する。

【ポジション状況確認モードの流れ】
- まず日付確認を行う（通常モードと同様）
- 週末や金曜夜はポジションを持ち越すリスクがあるため、日付確認後に「今日は週末ですね。週末のポジション状況はいかがですか？持ち越しの予定はありますか？」と確認する
- ポジションを持ち越す場合はリスク管理について一言添える

【振り返りモードの会話の流れ（参考）】
1. 対象期間（前月 or 今月進行中）の記録を分析してサマリーを伝える
2. 記録から経済イベントへの言及を抽出して提示する
3. 「他に印象に残ったイベントはありますか？」と聞く
4. うまくいったパターン・改善点を引き出す
5. 今後に向けての方針を聞く
6. 会話完了時にsaveMonthlyフィールドを追加して保存する（今月進行中の場合も同じyearMonthキーに保存され、複数回の振り返り記録として残る）

【記録モードの会話の流れ】
1. 所感から始める。
2. うまくいったこと・いかなかったことを引き出す（1往復目）
3. 原因を深掘り（2往復目）
4. 通貨ペアごとの損益合計を聞く
5. 今日の戦略・方針を聞く
6. 会話全体からタグを抽出して返答に含める

【コーチングの原則】
- 叱責しない・無理に頑張らせない
- 連続した損益悪化・ネガティブタグが続く場合はリセットを促す声かけをする

【返答形式】
返答は必ずJSON形式のみで返してください。
マークダウン、コードブロック、説明文、JSONの前後のテキストは一切含めないでください。
最初の文字は必ず{で始め、最後の文字は}で終わってください。

通常の返答：
{"message":"ユーザーへのメッセージ","ui":{"type":"text_input","placeholder":"入力例"},"recordDate":"2026-06-01"}

recordDateは記録対象日（YYYY-MM-DD形式）。日付が確定していない場合はnullにする。
日付確定後は毎回のレスポンスにrecordDateを含めること。

選択肢がある場合：
{"message":"メッセージ","ui":{"type":"select","options":["選択肢1","選択肢2"]}}

通貨ペアの損益入力：
{"message":"メッセージ","ui":{"type":"currency_pnl"}}

会話の記録が完了したと判断した場合はsaveフィールドを追加する：
{"message":"今日の記録を保存しました！","ui":{"type":"text_input","placeholder":"何かあればどうぞ"},"save":{"impression":"所感テキスト","strategy":"戦略テキスト","pnl":{"USDJPY":5000},"tags":{"emotion":["冷静"],"pattern":["ルール通り"]}}}

振り返りが完了した場合はsaveMonthlyフィールドを追加する：
{"message":"振り返りを保存しました！","ui":{"type":"text_input","placeholder":"何かあればどうぞ"},"saveMonthly":{"yearMonth":"2026-05","analysisText":"分析テキスト","summary":"サマリー2〜3文","economicEvents":[{"date":"2026-05-07","event":"FOMC会合"},{"date":"2026-05-22","event":"日銀会合"}],"highlights":["ハイライト1","ハイライト2"]}}

振り返りページへ誘導する場合はnavigateToフィールドを追加する：
{"message":"振り返りをしましょう。振り返りページへどうぞ。","ui":{"type":"text_input","placeholder":"何かあればどうぞ"},"navigateTo":"/review"}

uiのtypeは text_input / number_input / select / currency_pnl のいずれか。`;

export async function POST(req: NextRequest) {
  try {
    const { messages, uid } = await req.json();

    // Firestoreからコンテキスト取得
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][jst.getDay()];
    const hour = jst.getHours();
    const dateStr = getJstTradingDate();

    const [recentLogs, tagSettings, lastMonthlyReview] = await Promise.all([
      getRecentDailyLogs(uid),
      getOrInitTagSettings(),
      getLastMonthlyReview(uid),
    ]);

    const recentSummary =
  recentLogs.length === 0
    ? "記録なし"
    : recentLogs
        .map((log) => {
          const lastEntry = log.entries?.[log.entries.length - 1];
          return `${log.date}：${lastEntry?.impression ?? "所感なし"}`;
        })
        .join("\n");

    // 月初の場合は前月のログを取得
    const now2 = new Date();
    const jst2 = new Date(now2.getTime() + 9 * 60 * 60 * 1000);
    const lastMonth = `${jst2.getFullYear()}-${String(jst2.getMonth()).padStart(2, "0")}`;
    const monthlyLogs = jst2.getDate() <= 3
    ? await getMonthlyLogs(uid, lastMonth)
    : [];

    const monthlySummary = monthlyLogs.length === 0
  ? ""
  : monthlyLogs
      .map((log) => {
        const entries = log.entries?.map((e) => e.impression).filter(Boolean).join("／") ?? "所感なし";
        return `${log.date}：${entries}`;
      })
      .join("\n");

    const lastReviewText = lastMonthlyReview
      ? `${lastMonthlyReview.executedAt.slice(0, 10)}に${lastMonthlyReview.yearMonth}分を実施`
      : "未実施";

    const context = `今日の日付：${dateStr}（${weekday}曜日）、時間帯：${hour}時
        直近の記録：${recentSummary}
       最終振り返り：${lastReviewText}（先月：${lastMonth}、今月：${dateStr.slice(0, 7)}）${monthlySummary ? `\n\n前月の記録：\n${monthlySummary}` : ""}`;    
       
    //console.log("context:", context);
    const systemPrompt = buildSystemPrompt(context, tagSettings);

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