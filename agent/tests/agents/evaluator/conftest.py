"""Open the asyncpg pool for evaluator tests that hit Postgres."""
import os
import pytest_asyncio

from app.persistence import postgres


@pytest_asyncio.fixture(scope="function")
async def pg_pool():
    if not os.getenv("DATABASE_URL") and not os.getenv("POSTGRES_DSN"):
        # Tests using get_pool() will fail loudly; fixture only opens if env present.
        yield None
        return
    pool = await postgres.open_pool()
    yield pool
    await postgres.close_pool()
