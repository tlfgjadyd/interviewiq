import json
from functools import lru_cache
from pathlib import Path

from app.rag.schema import RagDocument


RAG_DATA_DIR = Path(__file__).resolve().parents[2] / "rag_data"


def _iter_jsonl_files(data_dir: Path) -> list[Path]:
    if not data_dir.exists():
        return []
    return sorted(data_dir.rglob("*.jsonl"))


@lru_cache(maxsize=1)
def load_rag_documents() -> tuple[RagDocument, ...]:
    documents: list[RagDocument] = []
    for path in _iter_jsonl_files(RAG_DATA_DIR):
        with path.open("r", encoding="utf-8") as file:
            for line_number, line in enumerate(file, start=1):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    documents.append(RagDocument.model_validate(json.loads(stripped)))
                except (json.JSONDecodeError, ValueError) as exc:
                    raise ValueError(f"Invalid RAG document at {path}:{line_number}") from exc
    return tuple(documents)


def reload_rag_documents() -> tuple[RagDocument, ...]:
    load_rag_documents.cache_clear()
    return load_rag_documents()
