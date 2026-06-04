"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get("accessToken");
    const tokenType = searchParams.get("tokenType") ?? "bearer";
    const expiresIn = searchParams.get("expiresIn");

    if (accessToken) {
      localStorage.setItem("interviewiq-access-token", accessToken);
      localStorage.setItem("interviewiq-token-type", tokenType);
      if (expiresIn) {
        localStorage.setItem("interviewiq-token-expires-in", expiresIn);
      }
    }

    router.replace("/documents");
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-slate-700">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        로그인 정보를 저장하고 있습니다.
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-slate-700">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        로그인 정보를 확인하고 있습니다.
      </div>
    </main>
  );
}
