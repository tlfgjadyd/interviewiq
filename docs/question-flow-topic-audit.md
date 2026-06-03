# Question Flow/Topic Audit

## Current Status

The frontend now has a JSON-backed question set structure for `flow x topic`
interview questions. The implementation is still mock-backed, but the runtime
and mock API can carry question metadata alongside the legacy string question.

Target user-facing default:

```text
start
-> user info
-> baseline
-> full_13 interview
-> result report
-> flow/topic weakness analysis
-> recommended drills
-> verification
```

`demo_5` exists only for development, demos, and quick tests. It is not the
default `/interview` flow.

## 1. JSON Question Set Location

Question types:

```text
frontend/lib/question-types.ts
```

Question set JSON files:

```text
frontend/data/question-sets/full_13.json
frontend/data/question-sets/demo_5.json
```

Question loader:

```text
frontend/lib/question-loader.ts
```

The loader imports both JSON files and exposes:

```ts
getQuestionSet(questionSetId)
getDefaultQuestionSet()
```

Invalid or missing `questionSetId` falls back to `full_13`.

## 2. full_13 / demo_5 Roles

`full_13`:

```text
User-facing default full interview.
13 questions.
```

Flow distribution:

```text
1-3     ice_breaking
4-6     basic_personality
7-9     job_competency
10-11   deep_dive
12-13   closing
```

`demo_5`:

```text
Development/demo/quick-test only.
5 questions.
One representative question per flow.
```

Flow distribution:

```text
1 ice_breaking
1 basic_personality
1 job_competency
1 deep_dive
1 closing
```

## 3. Question Metadata Shape

Added:

```ts
type InterviewQuestion = {
  questionId: string;
  order: number;
  flow: InterviewFlow;
  topic: QuestionTopic;
  title: string;
  text: string;
  intent: string;
  expectedAnswerSec: number;
  analysisFocus: AnalysisFocus[];
};
```

`InterviewFlow`, `QuestionTopic`, `AnalysisFocus`, `QuestionSetId`, and
`InterviewQuestionSet` are defined in `frontend/lib/question-types.ts`.

## 4. /interview Default

`/interview` now uses:

```ts
questionSetId: "full_13"
totalQuestions: getDefaultQuestionSet().questions.length // 13
initialQuestionMeta: full_13.questions[0]
```

The prior user-facing `totalQuestions = 5` default is removed from
`/interview`. A five-question set now exists only as `demo_5`.

## 5. Mock API Response Shape

The mock session API:

```text
frontend/app/api/sessions/[[...path]]/route.ts
```

now reads `questionSetId`, loads the JSON question set, and returns both legacy
string fields and metadata fields.

Start response shape includes:

```json
{
  "sessionId": "session_xxx",
  "questionSetId": "full_13",
  "totalQuestions": 13,
  "firstQuestion": "간단히 자기소개 부탁드립니다.",
  "firstQuestionMeta": {
    "questionId": "q01_intro_self",
    "order": 1,
    "flow": "ice_breaking",
    "topic": "self_introduction",
    "title": "자기소개",
    "text": "간단히 자기소개 부탁드립니다.",
    "intent": "면접 초반 기본 자기표현과 답변 시작 안정성을 확인한다.",
    "expectedAnswerSec": 60,
    "analysisFocus": ["speech_pace", "filler_words", "gaze_stability", "posture_stability"]
  },
  "currentQuestion": {
    "questionId": "q01_intro_self"
  }
}
```

Follow-up answer-finish responses include:

```text
nextQuestion
nextQuestionMeta
currentQuestion
```

where `nextQuestion` remains a string for backward compatibility.

## 6. Runtime currentQuestionMeta Access

`InterviewSessionContext` now stores:

```text
currentQuestion: string
currentQuestionMeta?: InterviewQuestion
questionSetId?: QuestionSetId
```

`InterviewRuntimeProvider` now exposes:

```text
currentQuestion: string
currentQuestionMeta?: InterviewQuestion
```

This keeps existing UI compatible while allowing future code to access:

```text
flow
topic
title
intent
analysisFocus
```

## 7. AnswerTurn flow/topic State

`AnswerTurn` is extended with:

```text
questionOrder
flow
topic
analysisFocus
```

`DrillAttempt` is also extended with:

```text
questionId
questionOrder
flow
topic
analysisFocus
```

For drill sessions, `InterviewRuntimeProvider.endAnswer()` copies the current
question metadata into the attempt when available. Full-session answer-turn
persistence is still not implemented in the frontend runtime or backend DB.

## 8. Report/Drill Source Metadata

`InterviewWeakPattern` now supports:

```text
flow
topic
sourceQuestionIds
analysisFocus
```

`DrillItem` now supports:

```text
sourceFlow
sourceTopic
sourceQuestionIds
sourcePatternId
analysisFocus
```

The fallback report and fallback drill plan populate these fields using a
`job_competency / project_experience` weakness example.

## 9. Still Mock

Still mock-backed:

```text
question set selection in backend
LLM question generation with flow/topic constraints
full-session answer-turn metadata persistence
real report weakPattern generation by flow/topic
real drill recommendation generation by flow/topic
```

Backend still has the older `phase/phaseGoal` model in:

```text
app/api/sessions.py
app/schemas/session.py
app/llm/question_generator.py
```

The backend `GeneratedQuestion` is still:

```py
text
source
error
```

It does not yet return `InterviewQuestion` metadata.

## 10. Next Required Files

Recommended next edit order:

1. `frontend/context/InterviewSessionContext.tsx`
   - Carry answer-turn metadata for full sessions, not only drill attempts.

2. `frontend/components/runtime/InterviewRuntimeProvider.tsx`
   - Add a stable current `AnswerTurn` object if result/report generation needs
     frontend-side answer tracking.

3. `app/schemas/session.py`
   - Add `questionSetId` and current-question metadata response fields.

4. `app/api/sessions.py`
   - Replace or map `INTERVIEW_PHASES` to `InterviewFlow`.
   - Return `currentQuestion` metadata in start and finish-answer responses.

5. `app/llm/question_generator.py`
   - Include `flow`, `topic`, `intent`, and `analysisFocus` in prompt input and
     output constraints.

6. Report generation
   - Produce `weakPatterns` with `flow`, `topic`, `sourceQuestionIds`, and
     `analysisFocus`.

7. Drill generation
   - Produce `DrillItem` with source `flow/topic` metadata.
