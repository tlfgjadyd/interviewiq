"use client";

import { SettingsProvider } from "@/lib/settings-provider";
import { RealtimeAudio } from "@/components/screenpipe/realtime-audio";
import Camera from "@/components/Camera/Camera";
import { MetricsProvider } from "@/context/MetricsContext";
import {
  InterviewSessionProvider,
  useInterviewSession,
} from "@/context/InterviewSessionContext";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

function InterviewWorkspace() {
  const {
    session,
    latestVision,
    isCreatingSession,
    isFinishingSession,
    error,
    startSession,
    finishSession,
  } = useInterviewSession();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b bg-background px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold">AI Interview Coach</h1>
            <p className="text-sm text-muted-foreground">
              {session
                ? `Question: ${session.currentQuestion}`
                : "Create a backend session before streaming chunks."}
            </p>
            {session && (
              <p className="mt-1 text-xs text-muted-foreground">
                sessionId={session.sessionId} / answerTurnId=
                {session.answerTurnId}
              </p>
            )}
            {latestVision && (
              <p className="mt-1 text-xs text-muted-foreground">
                latest vision score={latestVision.behaviorRiskScore} / level=
                {latestVision.level}
              </p>
            )}
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => startSession()}
              disabled={isCreatingSession}
            >
              {session ? "Restart Session" : "Start Session"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => finishSession()}
              disabled={!session || session.status === "finished" || isFinishingSession}
            >
              {isFinishingSession ? "Ending..." : "End Interview"}
            </Button>
          </div>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel>
          <RealtimeAudio />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>
          <Camera />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsProvider>
      <MetricsProvider>
        <InterviewSessionProvider>
          <InterviewWorkspace />
        </InterviewSessionProvider>
      </MetricsProvider>
    </SettingsProvider>
  );
}
