from fastapi import APIRouter

from app.rag.loader import reload_rag_documents
from app.rag.retriever import RagRetriever
from app.rag.schema import RagSearchQuery

router = APIRouter(prefix="/api/rag", tags=["rag"])
retriever = RagRetriever()


@router.post("/search")
async def search_rag(query: RagSearchQuery):
    results = retriever.search(
        company=query.company,
        cluster=query.cluster,
        industry=query.industry,
        role=query.role,
        interview_type=query.interview_type,
        text=query.text,
        doc_types=query.doc_types,
        limit=query.limit,
    )
    return [
        {
            "id": result.document.id,
            "content": result.document.content,
            "metadata": result.document.metadata.model_dump(),
            "score": result.score,
            "reasons": result.reasons,
        }
        for result in results
    ]


@router.post("/reload")
async def reload_rag():
    documents = reload_rag_documents()
    return {"status": "reloaded", "documentCount": len(documents)}
