from __future__ import annotations

import asyncio
from email import message_from_bytes
from email.policy import default

import pytest

from app.domain.ports.smtp import SmtpCredentials
from app.integrations.smtp import send_smtp_async


@pytest.mark.anyio
async def test_async_smtp_transport_delivers_message_to_local_server() -> None:
    received: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()

    async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.write(b"220 localhost ESMTP test\r\n")
        await writer.drain()
        while line := await reader.readline():
            command = line.decode("ascii", errors="replace").strip().upper()
            if command.startswith("EHLO"):
                writer.write(b"250-localhost\r\n250 SIZE 1048576\r\n")
            elif command.startswith(("MAIL FROM:", "RCPT TO:")):
                writer.write(b"250 ok\r\n")
            elif command == "DATA":
                writer.write(b"354 end with dot\r\n")
                await writer.drain()
                message = bytearray()
                while data_line := await reader.readline():
                    if data_line == b".\r\n":
                        break
                    message.extend(data_line[1:] if data_line.startswith(b"..") else data_line)
                if not received.done():
                    received.set_result(bytes(message))
                writer.write(b"250 queued\r\n")
            elif command == "RSET":
                writer.write(b"250 reset\r\n")
            elif command == "QUIT":
                writer.write(b"221 bye\r\n")
                await writer.drain()
                break
            else:
                writer.write(b"250 ok\r\n")
            await writer.drain()
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        await send_smtp_async(
            SmtpCredentials(
                host="127.0.0.1",
                port=port,
                username="",
                password="",
                secure=False,
                from_email="noreply@example.test",
            ),
            "recipient@example.test",
            "Stage 13 transport smoke",
            "SMTP delivery reached the local test server.",
        )
        raw_message = await asyncio.wait_for(received, timeout=2)
    finally:
        server.close()
        await server.wait_closed()

    message = message_from_bytes(raw_message, policy=default)
    assert message["From"] == "noreply@example.test"
    assert message["To"] == "recipient@example.test"
    assert message["Subject"] == "Stage 13 transport smoke"
    assert message.get_content().strip() == "SMTP delivery reached the local test server."
