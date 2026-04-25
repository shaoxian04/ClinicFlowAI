from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "change-me"

    postgres_dsn: str = "postgresql://postgres:postgres@localhost:5432/cliniflow"

    # OpenAI — used only for STT (Whisper)
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = "change-me"

    # GLM via ILMU — used for all LLM agent calls
    glm_base_url: str = "https://api.ilmu.ai/v1"
    glm_api_key: str = "change-me"
    glm_model: str = "ilmu-glm-5.1"

    agent_service_token: str = "change-me"

    llm_timeout_seconds: float = 8.0
    llm_max_steps: int = 10
    stt_timeout_seconds: float = 15.0


settings = Settings()
