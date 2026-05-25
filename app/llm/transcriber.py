import asyncio
from dataclasses import dataclass
from pathlib import Path

from openai import OpenAI, OpenAIError

from app.core.config import settings


@dataclass
class TranscriptionResult:
    text: str
    source: str
    model: str | None = None
    error: str | None = None


class AudioTranscriber:
    def __init__(self) -> None:
        self.model = settings.OPENAI_STT_MODEL
        self.enabled = bool(settings.OPENAI_API_KEY)
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY) if self.enabled else None

    async def transcribe_answer_audio(
        self,
        *,
        audio_path: str | None,
        language: str | None = None,
    ) -> TranscriptionResult:
        if not self.enabled or self.client is None:
            return TranscriptionResult(
                text="",
                source="fallback_openai_stt_disabled",
                model=self.model,
                error="OPENAI_API_KEY is not configured",
            )

        if not audio_path:
            return TranscriptionResult(
                text="",
                source="fallback_no_audio",
                model=self.model,
                error="answer audio path is missing",
            )

        path = Path(audio_path)
        if not path.exists():
            return TranscriptionResult(
                text="",
                source="fallback_audio_not_found",
                model=self.model,
                error=f"answer audio file not found: {audio_path}",
            )

        normalized_language = self._normalize_language(language)

        try:
            text = await asyncio.to_thread(self._transcribe_file, path, normalized_language)
        except OpenAIError as exc:
            return TranscriptionResult(
                text="",
                source="fallback_openai_stt_error",
                model=self.model,
                error=str(exc),
            )
        except OSError as exc:
            return TranscriptionResult(
                text="",
                source="fallback_audio_read_error",
                model=self.model,
                error=str(exc),
            )

        return TranscriptionResult(
            text=text.strip(),
            source="openai_transcription" if text.strip() else "fallback_empty_transcription",
            model=self.model,
            error=None if text.strip() else "OpenAI STT returned empty text",
        )

    @staticmethod
    def _normalize_language(language: str | None) -> str | None:
        if not language:
            return None
        normalized = language.strip().lower().replace("_", "-")
        if not normalized:
            return None
        return normalized.split("-", 1)[0]

    def _transcribe_file(self, path: Path, language: str | None) -> str:
        with path.open("rb") as audio_file:
            params = {
                "model": self.model,
                "file": audio_file,
                "response_format": "json",
            }
            if language:
                params["language"] = language
            response = self.client.audio.transcriptions.create(**params)

        if isinstance(response, str):
            return response
        text = getattr(response, "text", None)
        if isinstance(text, str):
            return text
        if isinstance(response, dict):
            return str(response.get("text") or "")
        return ""
