"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendBaseUrl } from "@/lib/session-api";

const DOCUMENT_STORAGE_KEY = "interviewiq-documents";

type ParsedDocuments = {
  resumeText: string;
  jobPostingText: string;
  company?: string | null;
  role?: string | null;
  resumeFileName?: string | null;
  jobPostingFileName?: string | null;
};

export default function DocumentsPage() {
  const router = useRouter();
  const backendBaseUrl = useMemo(getBackendBaseUrl, []);
  const [company, setCompany] = useState("sk_hynix");
  const [role, setRole] = useState("backend");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [jobPostingPdf, setJobPostingPdf] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!backendBaseUrl) {
      setError("NEXT_PUBLIC_BACKEND_URL이 설정되어야 PDF를 백엔드로 보낼 수 있습니다.");
      return;
    }
    if (!resumePdf || !jobPostingPdf) {
      setError("이력서 PDF와 채용공고 PDF를 모두 선택해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("resumePdf", resumePdf);
      formData.append("jobPostingPdf", jobPostingPdf);
      formData.append("company", company);
      formData.append("role", role);

      const response = await fetch(`${backendBaseUrl}/api/sessions/documents/pdf`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail ?? `PDF 처리 실패: ${response.status}`);
      }

      const parsed = (await response.json()) as ParsedDocuments;
      localStorage.setItem(
        DOCUMENT_STORAGE_KEY,
        JSON.stringify({
          resumeText: parsed.resumeText,
          jobPostingText: parsed.jobPostingText,
          company: parsed.company ?? company,
          role: parsed.role ?? role,
          resumeFileName: parsed.resumeFileName ?? resumePdf.name,
          jobPostingFileName: parsed.jobPostingFileName ?? jobPostingPdf.name,
          savedAt: new Date().toISOString(),
        })
      );
      router.push("/baseline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-6">
        <nav className="flex items-center gap-2 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          InterviewIQ
        </nav>

        <section className="flex flex-1 items-center py-10">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  <Upload className="h-4 w-4" />
                  문서 입력
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-normal">
                  이력서와 채용공고 PDF를 업로드하세요.
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  백엔드가 PDF 텍스트를 추출하고, 면접 세션 시작 직후 맞춤 질문 재료로
                  저장합니다.
                </p>
              </div>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">회사</span>
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">직무</span>
                <input
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <PdfInput
                label="이력서 PDF"
                file={resumePdf}
                onChange={setResumePdf}
              />
              <PdfInput
                label="채용공고 PDF"
                file={jobPostingPdf}
                onChange={setJobPostingPdf}
              />
            </div>

            {error ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-7 flex justify-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 bg-blue-600 px-6 text-base font-semibold hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                다음
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function PdfInput({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="flex min-h-36 cursor-pointer flex-col justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-blue-400 hover:bg-blue-50">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        <FileText className="h-4 w-4 text-blue-600" />
        {file ? file.name : "PDF 파일 선택"}
      </span>
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
