"""Синхронный SMTP-адаптер из стандартной библиотеки; вызывающий код выполняет \
сетевые операции вне UoW базы данных."""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from aiosmtplib import SMTP
from opentelemetry.trace import Tracer

from app.core.tracing import trace_async_operation
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


async def send_smtp_async(
    settings: SmtpCredentials,
    to: str,
    subject: str,
    body: str,
    tracer: Tracer | None = None,
) -> None:
    """Отправляет данные, не блокируя цикл событий; при отмене закрывает активный сокет."""
    if tracer is None:
        await _send_smtp_async(settings, to, subject, body)
    else:
        async with trace_async_operation(tracer, "smtp.send"):
            await _send_smtp_async(settings, to, subject, body)


async def _send_smtp_async(settings: SmtpCredentials, to: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.from_email
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    client = SMTP(
        hostname=settings.host,
        port=settings.port,
        username=settings.username or None,
        password=settings.password or None,
        timeout=60,
        use_tls=settings.secure,
    )
    try:
        async with asyncio.timeout(30):
            await client.connect(timeout=30)
        async with asyncio.timeout(65):
            await client.send_message(message, timeout=60)
    finally:
        client.close()


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
