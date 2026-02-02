"""Test that the tmp_config fixture properly cleans up on teardown."""

from server.app.routers import settings as settings_router
from server.app.routers import display as display_router
from server.app.routers import integrations as integrations_router
from server.app.routers import google_data as google_data_router


def test_tmp_config_sets_config(tmp_config):
    """Precondition: tmp_config sets _config on all routers."""
    assert settings_router._config is not None
    assert display_router._config is not None
    assert integrations_router._config is not None
    assert google_data_router._config is not None


def test_config_is_none_after_tmp_config_teardown():
    """After tmp_config teardown, _config should be reset to None on all routers.

    This test runs AFTER test_tmp_config_sets_config (alphabetical ordering).
    If the fixture doesn't reset _config, these will still be set from the
    previous test.
    """
    assert settings_router._config is None, (
        "settings_router._config leaked from previous test"
    )
    assert display_router._config is None, (
        "display_router._config leaked from previous test"
    )
    assert integrations_router._config is None, (
        "integrations_router._config leaked from previous test"
    )
    assert google_data_router._config is None, (
        "google_data_router._config leaked from previous test"
    )
