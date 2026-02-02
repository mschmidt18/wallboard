from server.app.logging import setup_logging
import structlog


def test_setup_logging_configures_structlog():
    setup_logging(level="DEBUG")
    logger = structlog.get_logger()
    # Should not raise
    logger.info("test message", key="value")
