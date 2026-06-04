"use client";

import Link from "next/link";
import { ArrowRight, FileText, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendBaseUrl } from "@/lib/session-api";

export default function HomePage() {
  const loginUrl = `${getBackendBaseUrl()}/api/auth/google/start?next=${encodeURIComponent(
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
            <Button asChild variant="ghost" size="sm">
              <a href={loginUrl}>
                <LogIn className="h-4 w-4" />
                Google 로그인
              </a>
            </Button>
          </nav>

          <div className="flex flex-1 items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                <FileText className="h-4 w-4" />
                PDF 기반 맞춤 면접 준비
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal text-slate-950 md:text-6xl">
                이력서와 채용공고를 넣고 바로 면접 흐름을 시작합니다.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                문서 입력 후 기준 자세를 측정하고, 준비가 끝나면 면접 화면으로 자동
                이동합니다.
              </p>

              <div className="mt-8">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-blue-600 px-6 text-base font-semibold hover:bg-blue-700"
                >
                  <Link href="/documents">
                    시작하기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
