"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  FileCheck2,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authHeaders, getBackendBaseUrl } from "@/lib/session-api";

const DOCUMENT_STORAGE_KEY = "interviewiq-documents";
const COURSE_STORAGE_KEY = "interviewiq-course";
const ACCESS_TOKEN_KEY = "interviewiq-access-token";

type ParsedDocuments = {
  resumeText: string;
  jobPostingText: string;
  company?: string | null;
  role?: string | null;
  resumeFileName?: string | null;
  jobPostingFileName?: string | null;
};

type CourseResponse = {
  id: string;
  documentId?: string | null;
  company?: string | null;
  role?: string | null;
  interviewType?: string | null;
};

export default function DocumentsPage() {
  const router = useRouter();
  const backendBaseUrl = useMemo(getBackendBaseUrl, []);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [jobPostingPdf, setJobPostingPdf] = useState<File | null>(null);
  const [parsedDocuments, setParsedDocuments] = useState<ParsedDocuments | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const canParse = Boolean(resumePdf && jobPostingPdf);
  const canCreateCourse = Boolean(parsedDocuments && company && role);

  useEffect(() => {
    if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
      router.replace("/");
      return;
    }

    setAuthChecked(true);
  }, [router]);

  const saveDocuments = (parsed: ParsedDocuments, course?: CourseResponse) => {
    localStorage.setItem(
      DOCUMENT_STORAGE_KEY,
      JSON.stringify({
        resumeText: parsed.resumeText,
        jobPostingText: parsed.jobPostingText,
        company,
        role,
        resumeFileName: parsed.resumeFileName ?? resumePdf?.name,
        jobPostingFileName: parsed.jobPostingFileName ?? jobPostingPdf?.name,
        savedAt: new Date().toISOString(),
      })
    );

    if (course) {
      localStorage.setItem(
        COURSE_STORAGE_KEY,
        JSON.stringify({
          courseId: course.id,
          documentId: course.documentId,
          company: course.company ?? company,
          role: course.role ?? role,
          interviewType: course.interviewType ?? "project_experience",
          savedAt: new Date().toISOString(),
        })
      );
    }
  };

  const handleParseDocuments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!backendBaseUrl || !resumePdf || !jobPostingPdf) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("resumePdf", resumePdf);
      formData.append("jobPostingPdf", jobPostingPdf);

      const response = await fetch(`${backendBaseUrl}/api/sessions/documents/pdf`, {
        method: "POST",
        body: formData,
      });

      const parsed = (await response.json()) as ParsedDocuments;

      setParsedDocuments(parsed);
      setCompany(parsed.company ?? "");
      setRole(parsed.role ?? "");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCourse = async () => {
    if (!backendBaseUrl || !parsedDocuments) return;

    setIsSubmitting(true);
    try {
      const courseResponse = await fetch(`${backendBaseUrl}/api/courses`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          company,
          role,
          interviewType: "project_experience",
          resumeText: parsedDocuments.resumeText,
          jobPostingText: parsedDocuments.jobPostingText,
          sourceFileName: [
            parsedDocuments.resumeFileName,
            parsedDocuments.jobPostingFileName,
          ]
            .filter(Boolean)
            .join(", "),
        }),
      });

      saveDocuments(parsedDocuments, (await courseResponse.json()) as CourseResponse);
      router.push("/guideline");
    } finally {
      setIsSubmitting(false);
    }
  };

  const skipForCameraTest = () => {
    localStorage.removeItem(DOCUMENT_STORAGE_KEY);
    localStorage.removeItem(COURSE_STORAGE_KEY);
    router.push("/guideline");
  };

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] text-sm font-semibold text-slate-600">
        로그인 상태를 확인하고 있습니다.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            InterviewIQ
          </div>
          <div className="text-sm font-medium text-slate-500">
            문서 입력 → 기준 측정 → 면접 시작
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_420px]">
          <form
            onSubmit={handleParseDocuments}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Upload className="h-4 w-4" />
              PDF 문서 입력
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-normal md:text-4xl">
              이력서와 채용공고를 업로드하면 맞춤 면접 재료로 사용합니다.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              두 PDF를 모두 선택한 뒤 PDF 분석을 누르면 회사와 직무를 추출합니다.
              추출된 값을 수정한 뒤 다음으로 넘어가세요.
            </p>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <Field
                label="회사"
                value={company}
                onChange={setCompany}
                icon={<Briefcase className="h-4 w-4" />}
              />
              <Field
                label="직무"
                value={role}
                onChange={setRole}
                icon={<FileText className="h-4 w-4" />}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <PdfInput label="이력서 PDF" file={resumePdf} onChange={setResumePdf} />
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

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={skipForCameraTest}>
                PDF 없이 화면 테스트
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting || !canParse}
                className="bg-blue-600 px-6 font-semibold hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                PDF 분석
              </Button>

              <Button
                type="button"
                disabled={isSubmitting || !canCreateCourse}
                onClick={handleCreateCourse}
                className="bg-blue-600 px-6 font-semibold hover:bg-blue-700"
              >
                <ArrowRight className="h-4 w-4" />
                다음
              </Button>
            </div>
          </form>

          <aside className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">넘어가지 않는 경우</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <p>1. 이력서 PDF와 채용공고 PDF를 둘 다 선택해야 합니다.</p>
              <p>2. 먼저 PDF 분석을 눌러 회사와 직무를 확인해야 합니다.</p>
              <p>3. 스캔 이미지 PDF는 텍스트 추출이 안 될 수 있습니다.</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-2 flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 focus-within:border-blue-500">
        <span className="text-slate-400">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
    </label>
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
    <label className="flex min-h-40 cursor-pointer flex-col justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-blue-400 hover:bg-blue-50">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="mt-5 flex items-center gap-2 text-sm text-slate-600">
        <FileText className="h-4 w-4 text-blue-600" />
        {file ? file.name : "PDF 파일 선택"}
      </span>
      <span className="mt-3 text-xs text-slate-500">
        {file ? "선택 완료" : "클릭해서 파일을 선택하세요"}
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