from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.config import settings


@lru_cache(maxsize=1)
def get_chat_model() -> ChatOpenAI:
    """
    Singleton chat model. OpenAI-compatible — swap to Z.AI GLM by changing
    OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL env vars.
    """
    return ChatOpenAI(
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )
