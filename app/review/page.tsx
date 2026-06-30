"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { getJstTradingDate } from "@/lib/dateUtils";

type DailyLog = {
  date: string;
  pnl: Record<string, number>;
  entries: { impression: string; strategy: string; tags: { emotion: string[]; pattern: string[] }; createdAt: string }[];
};

type MonthlyReview = {
  yearMonth: string;
  analysisText: string;
  summary: string;
  economicEvents: { date: string; event: string }[];
  highlights: string[];
  executedAt: string;
};

type ExchangeRate = {
  date: string;
  high: number;
  low: number;
  close: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type UiComponent =
  | { type: "text_input"; placeholder: string }
  | { type: "number_input"; placeholder: string }
  | { type: "select"; options: string[] }
  | { type: "currency_pnl" };

type GeminiResponse = {
  message: string;
  ui: UiComponent;
  saveMonthly?: {
    yearMonth: string;
    analysisText: string;
    summary: string;
    economicEvents: { date: string; event: string }[];
    highlights: string[];
  };
};

// 取引日のインデックスを使って近接イベントをクラスタリングし、段数(stackIndex)を付与する関数
function assignEventStackIndices(
  events: { date: string; event: string }[],
  chartData: { date: string }[]
) {
  const NEAR_THRESHOLD = 2; // 取引日インデックス差がこの値以内なら「近い」とみなす

  const dateIndexMap = new Map(chartData.map((d, i) => [d.date.slice(-5), i]));

  const sorted = events
    .map((e) => ({ ...e, idx: dateIndexMap.get(e.date.slice(-5)) ?? -1 }))
    .filter((e) => e.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  let stackIndex = 0;
  let prevIdx: number | null = null;

  return sorted.map((e) => {
    if (prevIdx !== null && e.idx - prevIdx <= NEAR_THRESHOLD) {
      stackIndex += 1;
    } else {
      stackIndex = 0;
    }
    prevIdx = e.idx;
    return { ...e, stackIndex };
  });
}

export default function ReviewPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReview | null>(null);
  const [yearMonth, setYearMonth] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [currentUi, setCurrentUi] = useState<UiComponent | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastInput, setLastInput] = useState("");
  
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [selectedPair, setSelectedPair] = useState("USD-JPY");
  
  const [reviewList, setReviewList] = useState<{ executedAt: string; yearMonth: string }[]>([]);
  const [selectedExecutedAt, setSelectedExecutedAt] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      setAuthLoading(false);
      const dateStr = getJstTradingDate();
      const currentYm = dateStr.slice(0, 7);
      setYearMonth(currentYm);
    });
    return () => unsubscribe();
  }, [router]);

    useEffect(() => {
      if (!user || !yearMonth) return;
      const executedAtParam = selectedExecutedAt ? `&executedAt=${encodeURIComponent(selectedExecutedAt)}` : "";
      fetch(`/api/review?uid=${user.uid}&yearMonth=${yearMonth}&pair=${selectedPair}${executedAtParam}`)
        .then((res) => res.json())
        .then((data) => {
          setDailyLogs(data.dailyLogs ?? []);
          setMonthlyReview(data.monthlyReview ?? null);
          setExchangeRates(data.exchangeRates ?? []);
        });
    }, [user, yearMonth, selectedPair, selectedExecutedAt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  useEffect(() => {
      if (!user) return;
  fetch(`/api/review-list?uid=${user.uid}`)
    .then((res) => res.json())
    .then((data) => setReviewList(data.reviews ?? []));
   }, [user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !user) return;
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setHasError(false);
    setLastInput(content);

    try {
      const res = await fetch("/api/review-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, uid: user.uid, yearMonth }),
      });
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data: GeminiResponse = await res.json();

      setMessages([...newMessages, { role: "assistant", content: data.message }]);
      setCurrentUi(data.ui);

      if (data.saveMonthly) {
        await fetch("/api/save-monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user.uid, saveMonthly: data.saveMonthly }),
        });
        // 保存後にデータを再取得
        const updated = await fetch(`/api/review?uid=${user.uid}&yearMonth=${yearMonth}`);
        const updatedData = await updated.json();
        setMonthlyReview(updatedData.monthlyReview ?? null);
      }
        } catch {
          setMessages([...messages, { role: "assistant", content: "エラーが発生しました。30秒程度待ってから再送信してください。" }]);
          setHasError(true);
          setInput(content);
        } finally {
          setLoading(false);
        }
         }, [messages, user, yearMonth]);

  useEffect(() => {
    if (user && messages.length === 0) {
      setTimeout(() => {
        sendMessage("振り返りをお願いします");
      }, 0);
    }
  }, [user, sendMessage]);

  const availableYearMonths = Array.from(new Set(reviewList.map((r) => r.yearMonth))).sort().reverse();
  const filteredReviewList = reviewList.filter((r) => r.yearMonth === yearMonth);
  
  const chartData = (() => {
  const dateMap = new Map<string, { date: string; total?: number; high?: number; low?: number; close?: number; rate?: number }>();

     dailyLogs.forEach((log) => {
      const total = Object.values(log.pnl ?? {}).reduce((a, b) => a + b, 0);
       dateMap.set(log.date, { date: log.date.slice(5), total });
     });

     exchangeRates.forEach((rate) => {
     const existing = dateMap.get(rate.date) ?? { date: rate.date.slice(5) };
     const avg = (rate.high + rate.low) / 2;
       dateMap.set(rate.date, { ...existing, rate: avg });
     });

     return Array.from(dateMap.entries())
       .sort(([a], [b]) => a.localeCompare(b))
       .map(([, v]) => v);
    })();
    
  const eventsWithStack = useMemo(() => assignEventStackIndices(monthlyReview?.economicEvents ?? [], chartData),
  [monthlyReview?.economicEvents, chartData]
    );

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中...</div>;
  if (!user) return null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-800">振り返り</h1>
        <div className="flex items-center gap-4">
          <select
            value={yearMonth}
            onChange={(e) => {
                setYearMonth(e.target.value);
                setSelectedExecutedAt(null);
            }}
            className="border border-gray-300 rounded-lg px-3 py-1 text-sm text-gray-800"
            >
         {availableYearMonths.map((ym) => (
          <option key={ym} value={ym}>{ym}</option>
        ))}
        </select>
        <select
        value={selectedExecutedAt ?? ""}
        onChange={(e) => setSelectedExecutedAt(e.target.value || null)}
        className="border border-gray-300 rounded-lg px-3 py-1 text-sm text-gray-800"
        >
        <option value="">最新の振り返り</option>
      {filteredReviewList.map((r) => (
        <option key={r.executedAt} value={r.executedAt}>
          {r.executedAt.slice(0, 10)} 実施
        </option>
      ))}
    </select>         
         <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-400 hover:text-gray-600" >
            チャットに戻る
          </button>
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex flex-1 overflow-hidden px-6 pb-6 gap-6 flex-col md:flex-row">

        {/* 左：チャット */}
        <div className="flex flex-col md:w-2/5 bg-white rounded-2xl shadow overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 rounded-2xl px-4 py-2 text-sm">入力中...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

            {currentUi?.type === "select" && (
              <div className="flex flex-wrap gap-2 mb-3">
                {currentUi.options.map((opt) => (
                  <button key={opt} onClick={() => sendMessage(opt)}
                    className="bg-white border border-blue-400 text-blue-600 rounded-full px-4 py-1 text-sm hover:bg-blue-50">
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {(currentUi?.type === "text_input" || currentUi?.type === "number_input" || currentUi?.type === "currency_pnl") && (
              <div className="flex gap-2">
                <input
                  type={currentUi.type === "number_input" ? "number" : "text"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                  placeholder={(currentUi as { type: string; placeholder?: string })?.placeholder}
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                />
                <button onClick={() => sendMessage(input)} disabled={loading}
                  className="bg-blue-500 text-white rounded-full px-5 py-2 text-sm hover:bg-blue-600 disabled:opacity-50">
                  送信
                </button>
              </div>
            )}
        </div>

        {/* 右：グラフ・サマリー */}
        <div className="flex flex-col md:w-3/5 overflow-y-auto gap-6">
         {/* 損益グラフ */}
         <div className="bg-white rounded-2xl shadow p-6">
           <div className="flex items-center justify-between mb-4">
           <h2 className="text-lg font-semibold text-gray-700">損益推移</h2>
           <p className="text-sm  text-gray-500" > ※為替レートは参考レート表示</p>
           <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700"
            >
             <option value="USD-JPY">USD/JPY</option>
             <option value="EUR-JPY">EUR/JPY</option>
             <option value="EUR-USD">EUR/USD</option>
           </select>
          </div>
          {chartData.length === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 90, right: 20, left: 20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" />
                 <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="pnl" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
               <Tooltip />
               <ReferenceLine yAxisId="pnl" y={0} stroke="#888" />
              {eventsWithStack.map((e, i) => (
              <ReferenceLine
                key={i}
                yAxisId="pnl"
                x={e.date.slice(5)}
                stroke="transparent"
                strokeDasharray="3 3"
                label={(props: { viewBox?: { x?: number; y?: number } }) => {
                  const x = props.viewBox?.x ?? 0;
                  const y = props.viewBox?.y ?? 0;
                  return (
                    <text
                      x={x}
                      y={y + 12 + e.stackIndex * 14}
                      fontSize={10}
                      fill="red"
                      textAnchor="middle"
                    >
                      {e.event}
                    </text>
                      );
                }}
              />
            ))}
               <Bar yAxisId="pnl" dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
               <Line yAxisId="rate" dataKey="rate" stroke="#f59e0b" strokeWidth={2} dot={false} name="レート" />
             </ComposedChart>
           </ResponsiveContainer>
           )}
         </div>
  
          {/* サマリー */}
          {monthlyReview && (
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">サマリー</h2>
              <p className="text-sm text-gray-700 mb-4">{monthlyReview.summary}</p>
              <h2 className="text-lg font-semibold text-gray-700 mb-3">分析</h2>
              <p className="text-sm text-gray-700 mb-4">{monthlyReview.analysisText}</p>
              <h2 className="text-lg font-semibold text-gray-700 mb-3">経済イベント</h2>
              <ul className="list-disc list-inside text-sm text-gray-700">
                {monthlyReview.economicEvents.map((e, i) => (
                  <li key={i}>{e.date}：{e.event}</li>
                ))}
              </ul>
            </div>
          )}
          {!monthlyReview && (
            <div className="bg-white rounded-2xl shadow p-6">
              <p className="text-gray-400 text-sm">この月の振り返りはまだありません</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}