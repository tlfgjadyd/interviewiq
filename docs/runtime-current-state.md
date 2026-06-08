# Runtime Current State

## Goal

`/interview` and `/training/drill` should use the same runtime abstraction for
session start, answer start, answer end, metrics, and completion flow.

## Shared Runtime

The shared runtime entry point is:

```text
frontend/components/runtime/InterviewRuntimeProvider.tsx
```

It wraps the existing providers:

```text
SettingsProvider
MetricsProvider
InterviewSessionProvider
```

and exposes a stable runtime interface:

```text
session
isSessionActive
currentQuestion
answerState
metrics
drillResults
currentRunNo
startSessionPayload
currentQuestionMeta
startSession()
startAnswer()
endAnswer()
finishSession()
```

`InterviewRuntimeProvider` is now the single frontend lifecycle entry point for
full sessions and drill sessions. It creates a `StartSessionRequest` from
`RuntimeConfig`, forwards that payload to the existing session adapter, controls
answer recording state, and reads the finished drill session report after drill
`endAnswer()`.
For full sessions, the default `questionSetId` is `full_12`.

## Current Real Parts

- `/interview` uses `InterviewRuntimeProvider` with `sessionType: "full"`.
- `/training/drill/[drillIndex]` uses `InterviewRuntimeProvider` with
  `sessionType: "drill"`.
- `/training/drill?planId=...&step=0` also uses the same provider and
  `DrillPlayer`.
- Camera and MediaPipe still run through the existing `Camera` component and
  `InterviewSessionContext`.
- The runtime provider adapts those existing pieces into one interface.
- Each drill run is represented as a new `sessionType: "drill"` session.
  The drill result is loaded from that session's report, not from a separate
  drill-attempt resource.

## Current Mock Parts

- If `NEXT_PUBLIC_BACKEND_URL` is empty, session calls still go to
  `frontend/app/api/sessions/[[...path]]/route.ts`.
- `/result` still uses rule-based mock report and drill-plan data from
  `frontend/lib/training.ts` only as fallback data.
- Drill completion is stored in a local progress fallback using `localStorage`.
- Drill scoring comes from the drill session report when a backend report is
  available; otherwise it falls back to normalized mock report data.

## Backend Alignment

The runtime config already carries the fields needed by the backend direction:

```text
sessionType
courseId
questionSetId
baselineId
sourceSessionId
drillId
drillTarget
maxAnswerSec
totalQuestions
```

The next backend integration should map `startSession()` to
`POST /api/courses/{courseId}/sessions/start` while keeping the runtime
interface unchanged.

## Start Session Payloads

Full session:

```json
{
  "sessionType": "full",
  "questionSetId": "full_12",
  "maxAnswerSec": 90,
  "totalQuestions": 13
}
```

Drill session:

```json
{
  "sessionType": "drill",
  "sourceSessionId": "session_xxx",
  "drillId": "drill_1_structure",
  "drillTarget": "answer_structure",
  "maxAnswerSec": 90,
  "totalQuestions": 1
}
```
