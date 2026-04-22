# agent/tests/routes/test_stt.py
import asyncio
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.datastructures import Headers, UploadFile


def _upload(content: bytes, filename: str = "test.webm", ct: str = "audio/webm") -> UploadFile:
    headers = Headers(headers={"content-type": ct})
    return UploadFile(file=io.BytesIO(content), filename=filename, headers=headers)


def test_transcribe_returns_text_from_whisper():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"text": "hello world"}
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("app.routes.stt.httpx.AsyncClient", return_value=mock_client):
        import importlib
        import app.routes.stt as _m
        importlib.reload(_m)
        from app.routes.stt import transcribe
        result = asyncio.run(transcribe(_upload(b"audio data")))

    import json
    assert json.loads(result.body)["text"] == "hello world"


def test_transcribe_empty_response_returns_empty_string():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {}
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("app.routes.stt.httpx.AsyncClient", return_value=mock_client):
        import importlib
        import app.routes.stt as _m
        importlib.reload(_m)
        from app.routes.stt import transcribe
        result = asyncio.run(transcribe(_upload(b"audio data")))

    import json
    assert json.loads(result.body)["text"] == ""
