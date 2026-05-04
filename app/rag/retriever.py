import re

from app.rag.loader import load_rag_documents
from app.rag.schema import DocType, RagDocument, RagSearchQuery, RagSearchResult


TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣_]+")


class RagRetriever:
    def search(
        self,
        *,
        company: str | None = None,
        cluster: str | None = None,
        industry: str | None = None,
        role: str | None = None,
        interview_type: str | None = None,
        text: str | None = None,
        doc_types: list[DocType] | None = None,
        limit: int = 5,
    ) -> list[RagSearchResult]:
        query = RagSearchQuery(
            company=company,
            cluster=cluster,
            industry=industry,
            role=role,
            interview_type=interview_type,
            text=text,
            doc_types=doc_types,
            limit=limit,
        )
        results = [
            self._score_document(document, query)
            for document in load_rag_documents()
        ]
        filtered = [result for result in results if result.score > 0]
        return sorted(
            filtered,
            key=lambda result: (
                result.score,
                result.document.metadata.priority,
                result.document.id,
            ),
            reverse=True,
        )[:limit]

    def context_strings(self, **kwargs) -> list[str]:
        return [result.document.content for result in self.search(**kwargs)]

    def _score_document(
        self,
        document: RagDocument,
        query: RagSearchQuery,
    ) -> RagSearchResult:
        score = float(document.metadata.priority)
        reasons: list[str] = [f"priority:{document.metadata.priority}"]

        if query.doc_types and document.metadata.doc_type not in query.doc_types:
            return RagSearchResult(document=document, score=0, reasons=[])

        if query.company and document.metadata.company == query.company:
            score += 10
            reasons.append("company")
        elif query.company and document.metadata.company:
            return RagSearchResult(document=document, score=0, reasons=[])

        if query.cluster and document.metadata.cluster == query.cluster:
            score += 4
            reasons.append("cluster")
        elif document.metadata.cluster == "general":
            score += 1
            reasons.append("general_cluster")

        if query.role and document.metadata.role == query.role:
            score += 5
            reasons.append("role")
        elif document.metadata.role == "general":
            score += 1
            reasons.append("general_role")

        if query.industry and document.metadata.industry == query.industry:
            score += 3
            reasons.append("industry")

        if query.interview_type and document.metadata.topic == query.interview_type:
            score += 4
            reasons.append("topic")

        keyword_hits = self._keyword_hits(document, query.text)
        if keyword_hits:
            score += min(keyword_hits, 5)
            reasons.append(f"keyword:{keyword_hits}")

        if score <= 0:
            return RagSearchResult(document=document, score=0, reasons=[])
        return RagSearchResult(document=document, score=score, reasons=reasons)

    def _keyword_hits(self, document: RagDocument, text: str | None) -> int:
        if not text:
            return 0
        query_tokens = set(TOKEN_PATTERN.findall(text.lower()))
        if not query_tokens:
            return 0
        document_text = (
            f"{document.content} "
            f"{document.metadata.topic} "
            f"{document.metadata.doc_type}"
        ).lower()
        document_tokens = set(TOKEN_PATTERN.findall(document_text))
        return len(query_tokens & document_tokens)
