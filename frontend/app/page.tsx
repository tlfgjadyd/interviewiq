"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendBaseUrl } from "@/lib/session-api";

const ACCESS_TOKEN_KEY = "interviewiq-access-token";

export default function HomePage() {
  const backendBaseUrl = useMemo(getBackendBaseUrl, []);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)));
  }, []);

  const loginUrl = `${backendBaseUrl}/api/auth/google/start?next=${encodeURIComponent(
    "http://localhost:3000/auth/callback"
  )}`;

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-6">
          <nav className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              InterviewIQ
            </Link>
            {hasToken ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/documents">문서 입력</Link>
              </Button>
            ) : null}
          </nav>

          <div className="flex flex-1 items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                <LogIn className="h-4 w-4" />
                로그인 후 면접 준비 시작
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal text-slate-950 md:text-6xl">
                먼저 로그인하고, 이력서와 채용공고를 기반으로 면접을 시작합니다.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                로그인 후 문서 입력, 기준 자세 측정, 실전 면접, 결과 리포트 순서로
                진행됩니다.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {hasToken ? (
                  <Button
                    asChild
                    size="lg"
                    className="h-12 bg-blue-600 px-6 text-base font-semibold hover:bg-blue-700"
                  >
                    <Link href="/documents">
                      문서 입력으로 이동
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    className="h-12 bg-blue-600 px-6 text-base font-semibold hover:bg-blue-700"
                  >
                    <a href={loginUrl}>
                      Google 로그인
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>

              {!hasToken ? (
                <p className="mt-4 text-sm text-slate-500">
                  Google OAuth 환경값이 비어 있으면 로그인 요청은 백엔드에서 503으로
                  막힙니다.
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-slate-200 py-5 text-sm text-slate-500">
            <span className="mr-3 inline-flex items-center gap-1">
              <FileText className="h-4 w-4" />
              로그인 → 문서 입력 → 기준 측정 → 면접 → 리포트
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
