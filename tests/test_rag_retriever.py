import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.rag import RagRetriever


def main() -> None:
    retriever = RagRetriever()
    results = retriever.search(
        company="sk_hynix",
        cluster="large_manufacturing",
        industry="semiconductor",
        role="backend",
        interview_type="project_experience",
        text="백엔드 프로젝트에서 API 응답 속도를 개선했습니다.",
        doc_types=["evaluation_criteria", "followup_question", "star_guide"],
        limit=5,
    )

    print(f"검색 결과: {len(results)}개")
    for index, result in enumerate(results, start=1):
        document = result.document
        print(f"\n[{index}] {document.id}")
        print(f"score={result.score} reasons={', '.join(result.reasons)}")
        print(f"doc_type={document.metadata.doc_type}")
        print(document.content)


if __name__ == "__main__":
    main()
