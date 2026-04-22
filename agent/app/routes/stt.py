from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.responses import JSONResponse

from app.config import settings

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> JSONResponse:
    audio_bytes = await audio.read()
    filename = audio.filename or "recording.webm"
    content_type = audio.content_type or "audio/webm"
    log.info("stt.transcribe.start", size=len(audio_bytes), content_type=content_type)
    try:
        async with httpx.AsyncClient(timeout=settings.stt_timeout_seconds) as client:
            r = await client.post(
                f"{settings.openai_base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": (filename, audio_bytes, content_type)},
                data={"model": "whisper-1"},
            )
            r.raise_for_status()
    except httpx.TimeoutException:
        log.warning("stt.transcribe.timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="STT upstream timeout")
    except httpx.HTTPStatusError as exc:
        log.error("stt.transcribe.upstream_error", upstream_status=exc.response.status_code)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="STT upstream error")
    except httpx.RequestError as exc:
        log.error("stt.transcribe.network_error", error=str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="STT upstream unreachable")
    text = r.json().get("text", "")
    log.info("stt.transcribe.ok", text_len=len(text))
    return JSONResponse({"text": text})
