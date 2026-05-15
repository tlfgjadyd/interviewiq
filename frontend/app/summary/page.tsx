"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

type SummaryPayload = {
  summary: string;
  history?: string;
  language?: "ko-KR" | "en-US";
  createdAt?: string;
};

export default function SummaryPage() {
  const [payload, setPayload] = useState<SummaryPayload | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");

    if (!key) {
      return;
    }

    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) {
      return;
    }

    try {
      setPayload(JSON.parse(raw) as SummaryPayload);
    } catch {
      setPayload(null);
    }
  }, []);

  const isKorean = payload?.language !== "en-US";

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
            <FileText className="h-4 w-4" />
            InterviewIQ Report
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            {isKorean ? "면접 요약 보고서" : "Interview Summary"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {payload?.createdAt
              ? new Date(payload.createdAt).toLocaleString()
              : isKorean
              ? "요약 데이터를 찾을 수 없습니다."
              : "Summary data was not found."}
          </p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            {isKorean ? "종합 피드백" : "Overall Feedback"}
          </h2>
          <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-800">
            {payload?.summary ??
              (isKorean
                ? "보고서 데이터가 없습니다. 면접 화면에서 Interview Summary를 다시 실행해 주세요."
                : "No report data is available. Please run Interview Summary again.")}
          </div>
        </section>

        {payload?.history && (
          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              {isKorean ? "답변 기록" : "Answer History"}
            </h2>
            <div className="mt-5 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
              {payload.history}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
