import { getAdminDb } from "./firebaseAdmin";

// dailyLogの型定義
export type DailyEntry = {
  impression: string;
  strategy: string;
  tags: { emotion: string[]; pattern: string[] };
  chatLog: { role: "user" | "assistant"; content: string }[];
  createdAt: string; // "2026-06-01T14:32:00+09:00"
};

export type DailyLog = {
  date: string; // "2026-06-01"
  pnl: Record<string, number>;
  entries: DailyEntry[];
};

// tagSettingsの型定義
export type TagSettings = {
  emotionTags: string[];
  patternTags: string[];
};

// デフォルトのタグ
const defaultTagSettings: TagSettings = {
  emotionTags: ["冷静", "焦り", "恐怖", "自信過剰", "迷い", "満足", "後悔"],
  patternTags: ["ルール通り", "ルール違反", "衝動エントリー","損切り躊躇", "利確早すぎ", "様子見過多", "エントリー遅れ"],
};

// dailyLogを保存する
export const saveDailyLog = async (
  uid: string,
  date: string,
  pnl: Record<string, number>,
  entry: Omit<DailyEntry, "createdAt">
) => {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/dailyLogs/${date}`);
  const snapshot = await ref.get();

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const createdAt = jst.toISOString().replace("Z", "+09:00");

  const newEntry: DailyEntry = { ...entry, createdAt };

  if (!snapshot.exists) {
    await ref.set({ date, pnl, entries: [newEntry] });
  } else {
    const existing = snapshot.data() as DailyLog;
    await ref.set({
      date,
      pnl,
      entries: [...(existing.entries ?? []), newEntry],
    });
  }
};

// 直近15件分のdailyLogを取得する
export const getRecentDailyLogs = async (uid: string): Promise<DailyLog[]> => {
  const db = getAdminDb();
  const ref = db.collection(`users/${uid}/dailyLogs`);
  const snapshot = await ref.orderBy("date", "desc").limit(15).get();
  return snapshot.docs.map((d) => d.data() as DailyLog);
};

// tagSettingsを取得する（なければデフォルトで初期化）
export const getOrInitTagSettings = async (): Promise<TagSettings> => {
  const db = getAdminDb();
  const ref = db.doc(`systemSettings/tagSettings`);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    await ref.set(defaultTagSettings);
    return defaultTagSettings;
  }
  return snapshot.data() as TagSettings;
};

// 最新の振り返りを取得する
export const getLastMonthlyReview = async (uid: string): Promise<{ yearMonth: string; executedAt: string } | null> => {
  const db = getAdminDb();
  const ref = db.collection(`users/${uid}/monthlyReviews`);
  const snapshot = await ref.orderBy("executedAt", "desc").limit(1).get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return { yearMonth: data.yearMonth, executedAt: data.executedAt };
};

// 月次振り返りの型定義
export type MonthlyReview = {
  yearMonth: string;
  analysisText: string;
  summary: string;
  economicEvents: { date: string; event: string }[];
  highlights: string[];
  executedAt: string;
};

// 当月の記録を全件取得する
export const getMonthlyLogs = async (uid: string, yearMonth: string): Promise<DailyLog[]> => {
  const db = getAdminDb();
  const ref = db.collection(`users/${uid}/dailyLogs`);
  const snapshot = await ref
    .orderBy("date", "asc")
    .where("date", ">=", `${yearMonth}-01`)
    .where("date", "<=", `${yearMonth}-31`)
    .get();
  return snapshot.docs.map((d) => d.data() as DailyLog);
};


// 月次振り返りを保存する
export const saveMonthlyReview = async (uid: string, review: MonthlyReview) => {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/monthlyReviews/${review.executedAt.slice(0, 10)}`);
  await ref.set(review);
};

// 為替レートの型定義
export type ExchangeRate = {
  high: number;
  low: number;
  close: number;
};

// 為替レートを保存する（バッチ書き込み）
export const saveExchangeRates = async (
  category: string,
  pair: string,
  rates: { date: string; high: number; low: number; close: number }[]
) => {
  const db = getAdminDb();
  const batch = db.batch();

  rates.forEach((rate) => {
    const ref = db.doc(`exchangeRates/${category}/${pair}/${rate.date}`);
    batch.set(ref, { high: rate.high, low: rate.low, close: rate.close });
  });

  await batch.commit();
};

// 為替レートを取得する（Firestore版、将来API差し替え可能）
export const getExchangeRates = async (
  pair: string,
  fromDate: string,
  toDate: string
): Promise<{ date: string; high: number; low: number; close: number }[]> => {
  const category = pair.includes("JPY") ? "JPY" : "OTHER";
  const db = getAdminDb();
  const ref = db.collection(`exchangeRates/${category}/${pair}`);
  const snapshot = await ref
    .where("__name__", ">=", fromDate)
    .where("__name__", "<=", toDate)
    .get();
  return snapshot.docs.map((d) => ({
    date: d.id,
    ...(d.data() as { high: number; low: number; close: number }),
  }));
};