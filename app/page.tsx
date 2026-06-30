"use client";
/* eslint-disable react-hooks/exhaustive-deps */

export const dynamic = "force-dynamic";

//import { useState, useEffect, useRef } from "react";

//未ログインユーザリダイレクト用
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";

type UiComponent =
  | { type: "text_input"; placeholder: string }
  | { type: "number_input"; placeholder: string }
  | { type: "select"; options: string[] }
  | { type: "currency_pnl" };

type Message = {
  role: "user" | "assistant";
  content: string;
};

type SaveData = {
  impression: string;
  strategy: string;
  pnl: Record<string, number>;
  tags: { emotion: string[]; pattern: string[] };
};

type MonthlyReviewData = {
  yearMonth: string;
  analysisText: string;
  summary: string;
  economicEvents: string[];
  highlights: string[];
};

type GeminiResponse = {
  message: string;
  ui: UiComponent;
  save?: SaveData;
  saveMonthly?: MonthlyReviewData;
  recordDate?: string | null;
  navigateTo?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [currentUi, setCurrentUi] = useState<UiComponent | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  const [recordDate, setRecordDate] = useState<string | null>(null);

  const [lastInput, setLastInput] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);

  const [navigateTo, setNavigateTo] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [patternTags, setPatternTags] = useState<string[]>([]);
  const [newEmotionTag, setNewEmotionTag] = useState("");
  const [newPatternTag, setNewPatternTag] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPair, setCsvPair] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

useEffect(() => {
  console.log('login attempt:', 'allowed:', process.env.NEXT_PUBLIC_ALLOWED_EMAIL);
  const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (u) => {
    setUser(u);
    setAuthLoading(false);
    if (!u) router.push("/login");
  });
  return () => unsubscribe();
}, [router]);

useEffect(() => {
  if (!user) return;
  fetch(`/api/tag-settings`)
    .then((res) => res.json())
    .then((data) => {
      setEmotionTags(data.emotionTags ?? []);
      setPatternTags(data.patternTags ?? []);
    });
}, [user]);

useEffect(() => {
  if (!user?.email) return;
  fetch(`/api/check-admin?email=${encodeURIComponent(user.email)}`)
    .then((res) => res.json())
    .then((data) => setIsAdmin(data.isAdmin));
}, [user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    setHasError(false);
    setLastInput(content);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, uid: user!.uid }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }

      const data: GeminiResponse = await res.json();

      setMessages([
        ...newMessages,
        { role: "assistant", content: data.message },
      ]);
      setCurrentUi(data.ui);
      if (data.recordDate) {
        setRecordDate(data.recordDate);
      }
      if (data.save) {
        await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user?.uid, save: data.save, recordDate, messages: newMessages }),
         });
      }
      if (data.saveMonthly) {
        await fetch("/api/save-monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user?.uid, saveMonthly: data.saveMonthly }),
        });
       }
      if (data.navigateTo) {
        setNavigateTo(data.navigateTo);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "エラーが発生しました。30秒程度後に再送信してください。" },
      ]);
     setHasError(true);
     setInput(content);
    } finally {
      setLoading(false);
    }  }, [messages, user]);

  // 初回メッセージ
 useEffect(() => {
  if (user && messages.length === 0) {
    setTimeout(() => {
      sendMessage("こんにちは、今日のトレード記録をつけたいです");
    }, 0);
  }
}, [user, sendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中...</div>;
  if (!user) return null;

  return (
  <div className="h-screen bg-gray-50 flex flex-col items-center overflow-hidden">
    <div className="flex items-center justify-between w-full max-w-xl px-4 py-4 flex-shrink-0">
      <h1 className="text-2xl font-bold text-gray-800">FX トレード日誌</h1>
      <div className="flex items-center gap-4">
         {isAdmin && (
        <button
          onClick={() => setShowSettings(true)}
          className="text-sm text-gray-400 hover:text-gray-600">
         ⚙️ 各種設定
        </button>
        )}
      <button
        onClick={() => signOut(getFirebaseAuth())}
        className="text-sm text-gray-400 hover:text-gray-600">
        ログアウト
      </button>
    </div>
    </div>

    <div className="w-full max-w-xl flex flex-col flex-1 overflow-hidden px-4 pb-4">
      <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-400 rounded-2xl px-4 py-2 text-sm">
              入力中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex-shrink-0">
        {navigateTo && (
          <button
            onClick={() => router.push(navigateTo)}
            className="w-full bg-blue-50 border border-blue-300 text-blue-600 rounded-full px-4 py-2 text-sm mb-3 hover:bg-blue-100"
            >
            振り返りページへ →
          </button>
        )}
        {currentUi?.type === "select" && (
          <div className="flex flex-wrap gap-2 mb-3">
            {currentUi.options.map((opt) => (
              <button
                key={opt}
                onClick={() => sendMessage(opt)}
                className="bg-white border border-blue-400 text-blue-600 rounded-full px-4 py-1 text-sm hover:bg-blue-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {(currentUi?.type === "text_input" || currentUi?.type === "number_input" || currentUi?.type === "currency_pnl") && (
          <div className="flex gap-2">
            <input
              type={currentUi?.type === "number_input" ? "number" : "text"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              placeholder={(currentUi as { type: string; placeholder?: string })?.placeholder}
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading}
              className="bg-blue-500 text-white rounded-full px-5 py-2 text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              送信
            </button>
          </div>
        )}
      </div>
    </div>

    {showSettings && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">共通設定</h2>

      {/* 感情タグ */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">感情タグ</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {emotionTags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-sm">
              {tag}
              <button onClick={() => setEmotionTags(emotionTags.filter((t) => t !== tag))} className="text-blue-400 hover:text-blue-600">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newEmotionTag}
            onChange={(e) => setNewEmotionTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEmotionTag.trim()) {
                setEmotionTags([...emotionTags, newEmotionTag.trim()]);
                setNewEmotionTag("");
              }
            }}
            placeholder="タグを追加"
            className="flex-1 border border-gray-300 rounded-full px-4 py-1 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={() => {
              if (newEmotionTag.trim()) {
                setEmotionTags([...emotionTags, newEmotionTag.trim()]);
                setNewEmotionTag("");
              }
            }}
            className="bg-blue-500 text-white rounded-full px-4 py-1 text-sm hover:bg-blue-600"
          >
            追加
          </button>
        </div>
      </div>

      {/* 判断パターンタグ */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">判断パターンタグ</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {patternTags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 bg-green-50 text-green-600 rounded-full px-3 py-1 text-sm">
              {tag}
              <button onClick={() => setPatternTags(patternTags.filter((t) => t !== tag))} className="text-green-400 hover:text-green-600">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPatternTag}
            onChange={(e) => setNewPatternTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPatternTag.trim()) {
                setPatternTags([...patternTags, newPatternTag.trim()]);
                setNewPatternTag("");
              }
            }}
            placeholder="タグを追加"
            className="flex-1 border border-gray-300 rounded-full px-4 py-1 text-sm text-gray-800 focus:outline-none focus:border-green-400"
          />
          <button
            onClick={() => {
              if (newPatternTag.trim()) {
                setPatternTags([...patternTags, newPatternTag.trim()]);
                setNewPatternTag("");
              }
            }}
            className="bg-green-500 text-white rounded-full px-4 py-1 text-sm hover:bg-green-600"
          >
            追加
          </button>
        </div>
      </div>

      {/* ボタン */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowSettings(false)}
          className="bg-gray-300 text-white  rounded-full  hover:text-gray-600 px-4 py-2"
        >
          キャンセル
        </button>
        <button
          onClick={async () => {
            await fetch("/api/tag-settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emotionTags, patternTags }),
            });
            setShowSettings(false);
          }}
          className="bg-blue-500 text-white rounded-full px-6 py-2 text-sm hover:bg-blue-600"
        >
          保存
        </button>
      </div>
    <div className="border-t border-gray-200 pt-4 mt-6"></div>
            {/* 為替レートCSVアップロード */}
 <h2 className="text-lg font-semibold text-gray-800 mb-4">管理者機能</h2>
  <h3 className="text-sm font-semibold text-gray-600 mb-2">為替レートCSVアップロード</h3>
  <div className="flex gap-2 mb-2">
    <input
      type="text"
      value={csvPair}
      onChange={(e) => setCsvPair(e.target.value)}
      placeholder="通貨ペア（例：EUR-JPY）"
      className="flex-1 border border-gray-300 rounded-full px-4 py-1 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
    />
  </div>
  <div className="flex gap-2 items-center">
    <input
    type="file"
    accept=".csv"
    onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
    className="text-sm text-gray-600 file:bg-green-500 file:text-white file:rounded-full file:px-4 file:py-1 file:border-0 file:mr-2 file:cursor-pointer hover:file:bg-blue-600"
    />
  </div>
    <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowSettings(false)}
          className="bg-gray-300 text-white  rounded-full  hover:text-gray-600 px-4 py-2"
        >
          キャンセル
        </button>
    <button
      onClick={async () => {
        if (!csvFile || !csvPair) {
          setUploadStatus("ファイルと通貨ペアを指定してください");
          return;
        }
        const formData = new FormData();
        formData.append("file", csvFile);
        formData.append("pair", csvPair);
        setUploadStatus("アップロード中...");
        const res = await fetch("/api/upload-exchange-rates", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          setUploadStatus(`${data.count}件保存しました`);
        } else {
          setUploadStatus("エラーが発生しました");
        }
      }}
      className="bg-blue-500 text-white rounded-full px-4 py-1 text-sm hover:bg-blue-600"
    >
      アップロード
    </button>
    </div>
        {uploadStatus && <p className="text-xs text-gray-500 mt-2">{uploadStatus}</p>}
    </div>
  </div>
)}
</div>
);
}