"""Pytest configuration and shared fixtures."""
import pytest

# Configure asyncio mode for Windows compatibility
pytest_plugins = ("pytest_asyncio",)


@pytest.fixture(autouse=True)
async def cleanup_driver():
    """Cleanup Neo4j driver after each test to avoid event loop issues on Windows."""
    yield
    # After each test, reset the driver to avoid event loop conflicts
    from app.graph.driver import close_driver
    await close_driver()
