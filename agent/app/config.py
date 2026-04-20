from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "change-me"

    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = "change-me"
    openai_model: str = "gpt-4o-mini"

    agent_service_token: str = "change-me"

    llm_timeout_seconds: float = 8.0
    stt_timeout_seconds: float = 15.0


settings = Settings()
