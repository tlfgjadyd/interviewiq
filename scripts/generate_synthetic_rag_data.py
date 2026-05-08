"""Generate synthetic RAG seed data for InterviewIQ.

The records created here are not official company interview criteria.
They are team-curated synthetic coaching snippets based on broad
industry and role expectations, intended for MVP RAG testing.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAG_DIR = ROOT / "rag_data"
SOURCE = "synthetic_team_curated"


def record(
    id_: str,
    content: str,
    *,
    cluster: str = "general",
    role: str = "general",
    doc_type: str,
    topic: str,
    priority: int = 3,
    company: str | None = None,
    industry: str | None = None,
) -> dict:
    metadata = {
        "cluster": cluster,
        "role": role,
        "doc_type": doc_type,
        "topic": topic,
        "source": SOURCE,
        "priority": priority,
    }
    if company:
        metadata["company"] = company
    if industry:
        metadata["industry"] = industry
    return {"id": id_, "content": content, "metadata": metadata}


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def company_rows(company: str, label: str, cluster: str, industry: str, traits: list[str]) -> list[dict]:
    prefix = f"{company}_backend"
    trait_text = ", ".join(traits)
    return [
        record(f"{prefix}_eval_001", f"{label} 백엔드 지원자는 {trait_text}을 답변 속에서 구체적인 사례와 지표로 연결해 설명하면 좋다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="evaluation_criteria", topic="company_fit", priority=5),
        record(f"{prefix}_eval_002", f"{label} 지원자의 프로젝트 답변은 문제 상황, 본인의 역할, 기술 선택 근거, 결과 지표, 운영 관점의 개선점을 함께 담을 때 설득력이 높다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="evaluation_criteria", topic="project_experience", priority=5),
        record(f"{prefix}_eval_003", f"{label} 면접에서는 구현 사실만 나열하기보다 장애 예방, 품질 관리, 협업 방식처럼 서비스나 시스템을 안정적으로 만드는 관점을 드러내는 답변이 유리하다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="evaluation_criteria", topic="problem_solving", priority=4),
        record(f"{prefix}_question_001", f"{label} 관점에서 최근 프로젝트의 병목을 어떤 지표로 발견했고, 개선 후 어떤 변화가 있었는지 질문한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="question", topic="technical_depth", priority=4),
        record(f"{prefix}_question_002", f"{label} 지원자에게 API, 데이터베이스, 배치, 자동화 중 가장 깊게 기여한 영역을 고르게 하고 설계 이유를 설명하게 한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="question", topic="project_experience", priority=4),
        record(f"{prefix}_question_003", f"{label} 업무 맥락에 맞춰 안정성과 속도 중 무엇을 우선했는지, 그 판단 기준이 무엇이었는지 질문한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="question", topic="problem_solving", priority=4),
        record(f"{prefix}_question_004", f"{label} 지원자에게 협업 중 요구사항 변경이나 일정 압박이 있었을 때 기술적으로 어떻게 조율했는지 질문한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="question", topic="collaboration", priority=3),
        record(f"{prefix}_question_005", f"{label} 지원 동기 답변에서는 회사나 산업 특성을 자신의 프로젝트 경험과 어떻게 연결하는지 확인한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="question", topic="motivation", priority=3),
        record(f"{prefix}_followup_001", f"지원자가 {label}에 맞춘 관심을 말했지만 경험 연결이 약하면, 본인의 프로젝트에서 그 관심사가 드러난 순간을 구체적으로 묻는다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="followup_question", topic="company_fit", priority=4),
        record(f"{prefix}_followup_002", "성능 개선을 말했다면 측정 지표, 측정 도구, 개선 전후 수치, 부작용 확인 방법을 순서대로 꼬리질문한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="followup_question", topic="technical_depth", priority=4),
        record(f"{prefix}_followup_003", "협업 경험을 말했다면 본인의 결정권, 상대 역할, 의견 충돌 지점, 최종 합의 방식을 확인하는 질문을 이어간다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="followup_question", topic="collaboration", priority=4),
        record(f"{prefix}_followup_004", "장애나 실패 사례가 나오면 재발 방지, 모니터링, 테스트 보강, 문서화 중 실제로 수행한 조치를 묻는다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="followup_question", topic="problem_solving", priority=4),
        record(f"{prefix}_good_answer_001", f"좋은 {label} 맞춤 답변은 회사 이름만 언급하지 않고, 산업 또는 서비스 특성 때문에 백엔드에서 중요해지는 안정성·품질·확장성 관점을 자신의 경험과 연결한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="good_answer", topic="company_fit", priority=3),
        record(f"{prefix}_good_answer_002", "좋은 프로젝트 답변은 '제가 맡은 범위', '선택한 기술', '대안과 trade-off', '개선 결과'가 분리되어 있어 면접관이 검증 질문을 하기 쉽다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="good_answer", topic="project_experience", priority=3),
        record(f"{prefix}_bad_answer_001", "부족한 답변은 팀 전체 성과를 말하지만 본인의 판단과 행동이 드러나지 않고, 결과도 '좋아졌다'처럼 추상적으로 끝난다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="bad_answer", topic="project_experience", priority=3),
        record(f"{prefix}_bad_answer_002", f"{label} 지원 동기에서 공개 정보만 반복하고 본인의 기술 경험과 연결하지 못하면 개인화가 약한 답변으로 평가될 수 있다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="bad_answer", topic="motivation", priority=3),
        record(f"{prefix}_value_001", f"{label} 관련 답변은 {traits[0]} 관점과 본인의 개발 경험을 연결하면 회사 맞춤성이 높아진다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="company_values", topic="company_fit", priority=3),
        record(f"{prefix}_value_002", f"{label} 맞춤 꼬리질문은 지원자가 말한 기술 경험이 {traits[-1]} 같은 업무 태도와 어떻게 이어지는지 확인하는 방향이 좋다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="company_values", topic="growth_potential", priority=3),
        record(f"{prefix}_report_001", f"최종 리포트에서 {label} 맞춤 피드백은 답변 내용이 {trait_text}과 얼마나 연결되었는지, 근거가 구체적인지 중심으로 작성한다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="evaluation_criteria", topic="final_report", priority=4),
        record(f"{prefix}_report_002", f"{label} 맞춤 개선 제안은 산업 지식 암기보다 프로젝트 경험을 회사 맥락으로 번역하는 연습을 권하는 방향이 적절하다.", company=company, cluster=cluster, industry=industry, role="backend", doc_type="evaluation_criteria", topic="final_report", priority=3),
    ]


backend_rows = [
    record("backend_eval_001", "백엔드 프로젝트 답변은 문제 상황, 본인의 역할, API 또는 데이터 설계 선택 이유, 성능과 안정성 개선 결과를 구체적으로 포함해야 한다.", role="backend", doc_type="evaluation_criteria", topic="project_experience", priority=5),
    record("backend_eval_002", "단순 구현 경험보다 요구사항 분석, 데이터 흐름 설계, 예외 처리, 장애 대응, 운영 관찰 지표를 함께 설명하면 백엔드 역량이 더 선명해진다.", role="backend", doc_type="evaluation_criteria", topic="technical_depth", priority=5),
    record("backend_eval_003", "데이터베이스 경험은 스키마 설계, 인덱스, 트랜잭션, 쿼리 최적화, 정합성 보장 중 본인이 실제로 판단한 지점을 중심으로 평가한다.", role="backend", doc_type="evaluation_criteria", topic="database", priority=4),
    record("backend_eval_004", "API 설계 답변에서는 endpoint 구조, 요청/응답 모델, 인증·인가, 에러 코드, 버전 관리 관점을 확인한다.", role="backend", doc_type="evaluation_criteria", topic="api_design", priority=4),
    record("backend_eval_005", "성능 개선 답변은 병목 가설, 측정 방법, 개선 조치, 검증 결과, 남은 한계를 포함하면 좋다.", role="backend", doc_type="evaluation_criteria", topic="performance", priority=5),
    record("backend_question_001", "가장 자신 있는 API를 하나 고르고, 요청부터 DB 접근과 응답 반환까지 흐름을 설명하게 한다.", role="backend", doc_type="question", topic="api_design", priority=4),
    record("backend_question_002", "프로젝트에서 데이터 모델을 어떻게 설계했고, 나중에 바꾸고 싶었던 부분이 무엇인지 질문한다.", role="backend", doc_type="question", topic="database", priority=4),
    record("backend_question_003", "성능 문제가 있었다면 로그, APM, 쿼리 분석, 부하 테스트 중 어떤 근거로 원인을 좁혔는지 질문한다.", role="backend", doc_type="question", topic="performance", priority=4),
    record("backend_question_004", "인증 또는 권한 처리를 구현했다면 보안상 어떤 실수를 방지하려 했는지 질문한다.", role="backend", doc_type="question", topic="security", priority=3),
    record("backend_question_005", "장애가 났을 때 사용자가 받는 영향과 개발자가 확인해야 하는 지표를 어떻게 정의했는지 질문한다.", role="backend", doc_type="question", topic="reliability", priority=4),
    record("backend_question_006", "테스트 코드를 작성했다면 단위 테스트와 통합 테스트의 경계를 어떻게 나눴는지 질문한다.", role="backend", doc_type="question", topic="testing", priority=3),
    record("backend_followup_001", "구현 내용만 말하고 근거가 부족하면, 선택한 구조의 대안과 trade-off를 추가로 질문한다.", role="backend", doc_type="followup_question", topic="technical_depth", priority=5),
    record("backend_followup_002", "DB 최적화를 말했다면 인덱스 추가 전후 실행 계획이나 응답 시간 변화를 확인한다.", role="backend", doc_type="followup_question", topic="database", priority=4),
    record("backend_followup_003", "캐시를 사용했다고 말하면 캐시 무효화, TTL, 데이터 정합성 문제를 어떻게 처리했는지 묻는다.", role="backend", doc_type="followup_question", topic="performance", priority=4),
    record("backend_followup_004", "MSA나 분산 구조를 언급하면 네트워크 실패, 재시도, idempotency를 고려했는지 확인한다.", role="backend", doc_type="followup_question", topic="reliability", priority=3),
    record("backend_followup_005", "보안 경험이 모호하면 인증과 인가의 차이, 민감 정보 저장 방식, 입력값 검증을 물어본다.", role="backend", doc_type="followup_question", topic="security", priority=3),
    record("backend_good_answer_001", "좋은 백엔드 답변은 '응답 시간이 평균 1.8초에서 0.6초로 줄었다'처럼 전후 지표를 제시하고, 본인이 맡은 범위를 명확히 설명한다.", role="backend", doc_type="good_answer", topic="performance", priority=4),
    record("backend_good_answer_002", "좋은 설계 답변은 특정 기술을 쓴 이유뿐 아니라 당시 팀 규모, 일정, 운영 난이도까지 고려한 판단을 설명한다.", role="backend", doc_type="good_answer", topic="technical_depth", priority=4),
    record("backend_good_answer_003", "좋은 협업 답변은 API 명세 합의, 변경 관리, 프론트엔드와의 테스트 방식처럼 구체적인 협업 장면을 포함한다.", role="backend", doc_type="good_answer", topic="collaboration", priority=3),
    record("backend_bad_answer_001", "부족한 답변은 프레임워크 사용법만 나열하고 왜 그 구조가 문제 해결에 적합했는지 설명하지 못한다.", role="backend", doc_type="bad_answer", topic="technical_depth", priority=3),
    record("backend_bad_answer_002", "부족한 성능 답변은 '최적화했다'고만 말하고 병목 지표, 측정 도구, 개선 전후 수치를 제시하지 않는다.", role="backend", doc_type="bad_answer", topic="performance", priority=4),
    record("backend_bad_answer_003", "부족한 DB 답변은 테이블을 만들었다는 설명에 그치고 관계, 제약조건, 조회 패턴을 고려한 흔적이 부족하다.", role="backend", doc_type="bad_answer", topic="database", priority=3),
    record("backend_report_001", "최종 리포트의 백엔드 역량 평가는 API 설계, 데이터 처리, 성능, 안정성, 협업 근거를 분리해서 작성하면 이해하기 쉽다.", role="backend", doc_type="evaluation_criteria", topic="final_report", priority=4),
    record("backend_report_002", "백엔드 개선 제안은 '수치를 붙여 말하기', '대안 기술과 비교하기', '운영 관점 언급하기'처럼 다음 연습 행동으로 바꾸어 제시한다.", role="backend", doc_type="evaluation_criteria", topic="final_report", priority=4),
    record("backend_report_003", "답변에 기술 용어가 많지만 면접관이 검증하기 어려우면, 개념 설명보다 실제 프로젝트 의사결정 순서로 재구성하도록 피드백한다.", role="backend", doc_type="evaluation_criteria", topic="final_report", priority=3),
]


large_manufacturing_rows = [
    record("large_manufacturing_eval_001", "대기업 제조 계열 면접에서는 품질, 안정성, 공정 이해, 협업, 책임감이 프로젝트 경험과 연결될 때 설득력이 높다.", cluster="large_manufacturing", role="general", doc_type="evaluation_criteria", topic="company_fit", priority=5, industry="manufacturing"),
    record("large_manufacturing_eval_002", "제조 산업의 IT 답변은 시스템 장애가 생산성, 품질, 업무 흐름에 줄 수 있는 영향을 고려하는 관점이 중요하다.", cluster="large_manufacturing", role="backend", doc_type="evaluation_criteria", topic="reliability", priority=4, industry="manufacturing"),
    record("large_manufacturing_question_001", "프로젝트에서 안정성이나 정확성이 중요했던 순간을 고르고, 어떤 검증 절차를 두었는지 질문한다.", cluster="large_manufacturing", role="backend", doc_type="question", topic="problem_solving", priority=4, industry="manufacturing"),
    record("large_manufacturing_question_002", "반복 업무 자동화나 데이터 처리 경험이 있다면 업무 효율이 어떻게 바뀌었는지 질문한다.", cluster="large_manufacturing", role="backend", doc_type="question", topic="automation", priority=3, industry="manufacturing"),
    record("large_manufacturing_followup_001", "품질을 강조한 답변에는 테스트, 모니터링, 재발 방지 문서화 중 실제 수행한 항목을 묻는다.", cluster="large_manufacturing", role="backend", doc_type="followup_question", topic="reliability", priority=4, industry="manufacturing"),
    record("large_manufacturing_followup_002", "공정이나 현업 이해를 언급하면 개발자가 요구사항을 어떻게 확인하고 우선순위를 조율했는지 묻는다.", cluster="large_manufacturing", role="backend", doc_type="followup_question", topic="collaboration", priority=3, industry="manufacturing"),
    record("large_manufacturing_good_001", "좋은 제조 계열 답변은 빠른 개발뿐 아니라 검증 가능성, 안정적 운영, 사용자 부서와의 조율을 함께 설명한다.", cluster="large_manufacturing", role="backend", doc_type="good_answer", topic="company_fit", priority=3, industry="manufacturing"),
    record("large_manufacturing_bad_001", "부족한 제조 계열 답변은 산업 특성을 고려하지 않고 일반적인 웹 서비스 개발 경험만 반복한다.", cluster="large_manufacturing", role="backend", doc_type="bad_answer", topic="company_fit", priority=3, industry="manufacturing"),
    record("large_manufacturing_report_001", "리포트에서는 제조 계열 적합도를 안정성, 품질 의식, 협업, 데이터 기반 문제 해결 항목으로 나누어 피드백한다.", cluster="large_manufacturing", role="backend", doc_type="evaluation_criteria", topic="final_report", priority=3, industry="manufacturing"),
    record("large_manufacturing_value_001", "제조 계열 지원자는 기술 경험을 실제 업무 흐름 개선이나 오류 감소와 연결해 설명하면 회사 맥락과 잘 맞는다.", cluster="large_manufacturing", role="general", doc_type="company_values", topic="company_fit", priority=3, industry="manufacturing"),
]


large_it_rows = [
    record("large_it_eval_001", "대기업 IT·플랫폼 계열 면접에서는 사용자 영향, 대규모 트래픽, 데이터 기반 개선, 빠른 실험과 안정적 운영의 균형을 본다.", cluster="large_it", role="general", doc_type="evaluation_criteria", topic="company_fit", priority=5, industry="platform"),
    record("large_it_eval_002", "플랫폼 백엔드 답변은 요청량 증가, 장애 전파, 배포 안정성, 모니터링 지표를 고려하면 깊이가 생긴다.", cluster="large_it", role="backend", doc_type="evaluation_criteria", topic="reliability", priority=4, industry="platform"),
    record("large_it_question_001", "사용자 경험에 영향을 준 백엔드 문제를 어떤 데이터로 발견했고 개선했는지 질문한다.", cluster="large_it", role="backend", doc_type="question", topic="performance", priority=4, industry="platform"),
    record("large_it_question_002", "트래픽이 갑자기 늘어난다면 현재 설계에서 가장 먼저 병목이 될 부분이 무엇인지 질문한다.", cluster="large_it", role="backend", doc_type="question", topic="scalability", priority=4, industry="platform"),
    record("large_it_followup_001", "대규모 트래픽을 언급하면 캐시, 큐, DB 분산, 비동기 처리 중 실제로 경험한 부분을 확인한다.", cluster="large_it", role="backend", doc_type="followup_question", topic="scalability", priority=4, industry="platform"),
    record("large_it_followup_002", "사용자 지표를 말했다면 개발 변경이 그 지표에 미친 영향을 어떻게 검증했는지 묻는다.", cluster="large_it", role="backend", doc_type="followup_question", topic="data_driven", priority=3, industry="platform"),
    record("large_it_good_001", "좋은 플랫폼 계열 답변은 기술 개선이 사용자 지표, 운영 안정성, 팀 개발 속도 중 무엇을 바꾸었는지 연결한다.", cluster="large_it", role="backend", doc_type="good_answer", topic="company_fit", priority=3, industry="platform"),
    record("large_it_bad_001", "부족한 플랫폼 계열 답변은 대규모 서비스를 말하지만 실제 트래픽, 장애, 모니터링, 데이터 근거가 없다.", cluster="large_it", role="backend", doc_type="bad_answer", topic="company_fit", priority=3, industry="platform"),
    record("large_it_report_001", "리포트에서는 IT 계열 적합도를 사용자 영향, 확장성 사고, 데이터 기반 개선, 운영 안정성 항목으로 나누어 피드백한다.", cluster="large_it", role="backend", doc_type="evaluation_criteria", topic="final_report", priority=3, industry="platform"),
    record("large_it_value_001", "IT·플랫폼 계열 지원자는 기술 선택을 사용자 문제 해결과 연결해 말하면 직무 적합성이 더 잘 드러난다.", cluster="large_it", role="general", doc_type="company_values", topic="company_fit", priority=3, industry="platform"),
]


star_rows = [
    record("star_guide_001", "STAR 답변은 Situation, Task, Action, Result 순서로 구성한다. Action에서는 본인이 직접 한 판단과 행동을 말하고, Result에서는 수치나 검증 가능한 결과를 제시한다.", doc_type="star_guide", topic="project_experience", priority=5),
    record("star_guide_002", "Situation은 배경 설명이 길어지지 않도록 문제 상황과 제약 조건만 짧게 제시하는 것이 좋다.", doc_type="star_guide", topic="answer_structure", priority=4),
    record("star_guide_003", "Task는 팀 목표가 아니라 지원자 본인이 맡은 책임과 해결해야 했던 과제를 중심으로 말한다.", doc_type="star_guide", topic="answer_structure", priority=4),
    record("star_guide_004", "Action은 가장 길게 설명해도 되는 부분이며, 선택지 비교, 의사결정 기준, 실제 실행 과정을 포함한다.", doc_type="star_guide", topic="answer_structure", priority=5),
    record("star_guide_005", "Result는 정량 지표가 가장 좋지만, 지표가 없다면 사용자 반응, 팀 운영 변화, 재발 방지 효과처럼 검증 가능한 결과를 제시한다.", doc_type="star_guide", topic="answer_structure", priority=4),
    record("star_followup_001", "답변에 Result가 약하면 결과 지표, 사용자 반응, 팀 기여도, 배운 점 중 하나를 구체화하도록 꼬리질문한다.", doc_type="followup_question", topic="answer_structure", priority=4),
    record("star_followup_002", "Action이 추상적이면 '직접 작성한 코드나 설계 결정은 무엇이었나요?'처럼 본인 행동을 확인한다.", doc_type="followup_question", topic="answer_structure", priority=4),
    record("star_followup_003", "Situation이 길면 면접관은 핵심 문제와 본인 역할을 한 문장으로 다시 요약하게 할 수 있다.", doc_type="followup_question", topic="answer_structure", priority=3),
    record("star_good_001", "좋은 STAR 답변은 '문제 발견 → 내 역할 → 선택한 해결책 → 수치 결과 → 배운 점'의 흐름이 자연스럽다.", doc_type="good_answer", topic="answer_structure", priority=4),
    record("star_bad_001", "부족한 STAR 답변은 배경 설명에 시간을 많이 쓰고, 본인의 Action과 Result가 짧게 지나간다.", doc_type="bad_answer", topic="answer_structure", priority=3),
    record("star_report_001", "리포트에서는 STAR 균형을 S/T/A/R 각각의 비중과 구체성으로 나누어 피드백하면 사용자가 수정하기 쉽다.", doc_type="evaluation_criteria", topic="final_report", priority=3),
    record("star_report_002", "개선 제안은 '다음 답변에서는 Action을 두 단계 이상으로 나누어 말하기'처럼 구체적인 연습 문장으로 제공한다.", doc_type="evaluation_criteria", topic="final_report", priority=3),
]


interview_basics_rows = [
    record("interview_basics_001", "면접 답변은 두괄식으로 핵심을 먼저 말한 뒤, 구체적인 사례와 본인의 역할, 결과를 이어가는 구성이 이해하기 쉽다.", doc_type="interview_basics", topic="general", priority=4),
    record("interview_basics_002", "꼬리질문은 지원자의 답변 중 모호한 역할, 부족한 결과 지표, 기술 선택 근거, 협업 갈등 해결 과정을 확인하는 방향이 좋다.", doc_type="followup_question", topic="general", priority=4),
    record("interview_basics_003", "답변이 길어질 때는 결론, 핵심 근거 두 가지, 마무리 한 문장으로 압축하도록 피드백한다.", doc_type="interview_basics", topic="answer_clarity", priority=3),
    record("interview_basics_004", "지원 동기는 회사 칭찬보다 본인의 경험, 직무 역량, 앞으로 기여하고 싶은 영역이 연결될 때 자연스럽다.", doc_type="interview_basics", topic="motivation", priority=4),
    record("interview_basics_005", "갈등 경험 답변은 상대방 비판보다 문제 정의, 조율 방식, 합의 결과, 배운 점을 중심으로 말한다.", doc_type="interview_basics", topic="collaboration", priority=4),
    record("interview_question_001", "최근 프로젝트에서 가장 어려웠던 문제와 본인이 직접 해결한 부분을 질문한다.", doc_type="question", topic="project_experience", priority=4),
    record("interview_question_002", "팀 프로젝트에서 의견이 갈렸던 순간과 합의에 이른 과정을 질문한다.", doc_type="question", topic="collaboration", priority=3),
    record("interview_question_003", "실패하거나 아쉬웠던 경험을 고르고, 다음에는 무엇을 다르게 할지 질문한다.", doc_type="question", topic="growth_potential", priority=3),
    record("interview_followup_001", "답변에 '저희가'라는 표현이 많으면 본인이 맡은 역할과 결정한 내용을 구체적으로 묻는다.", doc_type="followup_question", topic="project_experience", priority=4),
    record("interview_followup_002", "결과가 모호하면 수치, 비교 기준, 사용자 반응, 팀 피드백 중 하나로 근거를 보강하게 한다.", doc_type="followup_question", topic="answer_clarity", priority=4),
    record("interview_good_001", "좋은 답변은 면접관이 추가 질문할 수 있는 구체적 단서를 남기되, 핵심 흐름은 한 번에 이해되게 한다.", doc_type="good_answer", topic="general", priority=3),
    record("interview_bad_001", "부족한 답변은 좋은 태도나 열정을 반복하지만 실제 행동, 기술 판단, 결과가 드러나지 않는다.", doc_type="bad_answer", topic="general", priority=3),
    record("interview_report_001", "최종 리포트는 강점, 보완점, 다음 연습 질문, 답변 재구성 예시를 함께 제공하면 학습 효과가 높다.", doc_type="evaluation_criteria", topic="final_report", priority=3),
]


nonverbal_rows = [
    record("nonverbal_fullbody_001", "전신 면접에서는 정밀 시선 추적보다 얼굴 방향 기반 주의 집중도, 상체 자세 안정성, 손 움직임 및 제스처 안정성, 하체 반복 움직임을 완곡하게 피드백한다.", doc_type="nonverbal_criteria", topic="project_experience", priority=5),
    record("nonverbal_caution_001", "비언어 분석은 긴장 상태 진단이나 감정 판별처럼 단정적으로 표현하지 않는다. 관찰된 지표를 바탕으로 개선 제안을 제공한다.", doc_type="nonverbal_criteria", topic="general", priority=5),
    record("nonverbal_posture_001", "자세 피드백은 '자세가 무너졌습니다'보다 '상체 자세 안정성이 낮게 감지된 구간이 있습니다'처럼 관찰 중심으로 표현한다.", doc_type="nonverbal_criteria", topic="posture", priority=4),
    record("nonverbal_gaze_001", "얼굴 방향 피드백은 카메라 응시를 강요하기보다 답변 중 정면을 향한 비율이 낮았던 구간을 알려주는 방식이 적절하다.", doc_type="nonverbal_criteria", topic="gaze", priority=4),
    record("nonverbal_gesture_001", "손 움직임 피드백은 제스처 자체를 부정하지 않고, 반복적이거나 산만하게 보일 수 있는 움직임이 증가한 구간을 안내한다.", doc_type="nonverbal_criteria", topic="gesture", priority=4),
    record("nonverbal_leg_001", "하체 움직임 피드백은 다리 떨림을 감정으로 해석하지 않고 반복 움직임 신호가 감지되었다고 표현한다.", doc_type="nonverbal_criteria", topic="leg_movement", priority=4),
    record("nonverbal_voice_001", "음성 피드백은 목소리 크기, 침묵 길이, 말 속도, 음성 안정성 같은 측정 가능한 신호 중심으로 제공한다.", doc_type="nonverbal_criteria", topic="voice", priority=4),
    record("nonverbal_event_001", "timelineEvents는 특정 구간의 비언어 또는 음성 신호와 관련 답변 텍스트를 연결해 보여주면 사용자가 원인을 이해하기 쉽다.", doc_type="evaluation_criteria", topic="timeline", priority=4),
    record("nonverbal_good_001", "좋은 비언어 리포트는 점수만 보여주지 않고, 어느 구간에서 어떤 신호가 있었고 다음에는 어떻게 조정하면 되는지 제안한다.", doc_type="good_answer", topic="final_report", priority=3),
    record("nonverbal_bad_001", "부족한 비언어 리포트는 '불안함', '자신감 부족'처럼 감정이나 성격을 단정하는 표현을 사용한다.", doc_type="bad_answer", topic="final_report", priority=3),
    record("nonverbal_report_001", "최종 리포트에서 비언어 평가는 자세, 얼굴 방향, 손 움직임, 하체 움직임, 음성 안정성을 분리해 짧게 요약한다.", doc_type="evaluation_criteria", topic="final_report", priority=3),
    record("nonverbal_report_002", "비언어 개선 제안은 '첫 문장을 말할 때 상체를 고정하고 정면을 향하기'처럼 면접자가 바로 연습할 수 있는 행동으로 제시한다.", doc_type="evaluation_criteria", topic="final_report", priority=3),
]


def main() -> None:
    data = {
        RAG_DIR / "companies" / "sk_hynix.jsonl": company_rows(
            "sk_hynix",
            "SK하이닉스",
            "large_manufacturing",
            "semiconductor",
            ["반도체 산업 이해", "제조 공정과 IT 시스템의 연결", "협업", "책임감"],
        ),
        RAG_DIR / "companies" / "samsung_electronics.jsonl": company_rows(
            "samsung_electronics",
            "삼성전자",
            "large_manufacturing",
            "semiconductor",
            ["품질과 안정성", "문제 해결력", "기술적 근거", "커뮤니케이션"],
        ),
        RAG_DIR / "companies" / "naver.jsonl": company_rows(
            "naver",
            "네이버",
            "large_it",
            "platform",
            ["사용자 경험", "대규모 트래픽", "서비스 안정성", "데이터 기반 개선"],
        ),
        RAG_DIR / "roles" / "backend.jsonl": backend_rows,
        RAG_DIR / "clusters" / "large_manufacturing.jsonl": large_manufacturing_rows,
        RAG_DIR / "clusters" / "large_it.jsonl": large_it_rows,
        RAG_DIR / "common" / "star_guide.jsonl": star_rows,
        RAG_DIR / "common" / "interview_basics.jsonl": interview_basics_rows,
        RAG_DIR / "common" / "nonverbal_criteria.jsonl": nonverbal_rows,
    }
    for path, rows in data.items():
        write_jsonl(path, rows)
    total = sum(len(rows) for rows in data.values())
    print(f"Generated {total} synthetic RAG records in {RAG_DIR}")


if __name__ == "__main__":
    main()
