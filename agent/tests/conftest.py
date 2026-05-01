"""Pytest configuration and shared fixtures."""
import pytest

# Configure asyncio mode for Windows compatibility
pytest_plugins = ("pytest_asyncio",)


# Opt-in Neo4j driver cleanup fixture. Tests that touch app.graph.driver and
# need the singleton AsyncDriver torn down between tests should request this
# fixture by name. NOT autouse — applying it globally collides with
# module-scoped event loops used in tests/routes/conftest.py
# (pytest_asyncio.MultipleEventLoopsRequestedError when the autouse function
# loop and the module-scope wired_pool loop disagree).
@pytest.fixture
async def cleanup_driver():
    """Reset the Neo4j driver after this test to avoid event-loop reuse issues."""
    yield
    from app.graph.driver import close_driver
    await close_driver()
