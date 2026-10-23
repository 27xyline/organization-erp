"""Synchronous stdlib SMTP adapter; callers run network work outside DB UoWs."""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from app.domain.ports.smtp import SmtpCredentials


def verify_smtp(settings: SmtpCredentials) -> bool:
    try:
        with _client(settings, 5) as client:
            client.login(settings.username, settings.password)
        return True
    except (OSError, smtplib.SMTPException):
        return False


def send_smtp(settings: SmtpCredentials, to: str, subject: str, body: str) -> None:
    with _client(settings, 60) as client:
        message = EmailMessage()
        message["From"] = settings.from_email
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        client.send_message(message)


def _client(settings: SmtpCredentials, timeout: int) -> smtplib.SMTP:
    if settings.secure:
        client: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.host, settings.port, timeout=timeout, context=ssl.create_default_context()
        )
    else:
        client = smtplib.SMTP(settings.host, settings.port, timeout=timeout)
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
    return client
