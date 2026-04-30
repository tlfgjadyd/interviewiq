from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/chunks", tags=["chunks"])


@router.post("")
async def legacy_receive_chunk():
    raise HTTPException(
        status_code=410,
        detail=(
            "POST /api/chunks is deprecated. Use "
            "POST /api/sessions/{sessionId}/vision-chunks and "
            "POST /api/sessions/{sessionId}/audio-chunks instead."
        ),
    )
