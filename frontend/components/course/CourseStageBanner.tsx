import { CheckCircle2 } from "lucide-react";

type CourseStageBannerProps = {
  current: string;
  next?: string;
  progressLabel?: string;
  tone?: "dark" | "light";
};

export function CourseStageBanner({
  current,
  next,
  progressLabel,
  tone = "light",
}: CourseStageBannerProps) {
  const isDark = tone === "dark";

  return (
    <div
      className={
        isDark
          ? "rounded-2xl border border-white/15 bg-slate-950/48 px-4 py-3 text-white shadow-lg backdrop-blur"
          : "rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2
            className={isDark ? "h-4 w-4 text-blue-300" : "h-4 w-4 text-blue-600"}
          />
          <span className="text-sm font-semibold">현재 단계: {current}</span>
        </div>
        {next ? (
          <span className={isDark ? "text-sm text-white/70" : "text-sm text-slate-500"}>
            다음 단계: {next}
          </span>
        ) : null}
        {progressLabel ? (
          <span
            className={
              isDark
                ? "ml-auto rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                : "ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
            }
          >
            {progressLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
