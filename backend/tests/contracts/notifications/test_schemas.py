import pytest
from pydantic import ValidationError

from app.schemas.notifications import NotificationPreferencesInput, NotificationQueryInput


def test_unread_only_requires_literal_boolean_string():
    assert NotificationQueryInput.model_validate({"unreadOnly": "false"}).unreadOnly is False
    with pytest.raises(ValidationError):
        NotificationQueryInput.model_validate({"unreadOnly": "0"})


def test_duplicate_preference_pair_is_rejected():
    preference = {"eventType": "SYSTEM", "channel": "IN_APP", "enabled": True}
    with pytest.raises(ValidationError, match="Настройка канала указана повторно"):
        NotificationPreferencesInput.model_validate({"preferences": [preference, preference]})
