"""Transactional email delivery. Credentials stay exclusively in environment variables."""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage


class EmailDeliveryError(Exception):
    pass


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes"}


def send_password_reset_email(recipient: str, reset_url: str) -> None:
    _send_email(
        recipient,
        "Redefinição de senha - CronEdu",
        "Recebemos uma solicitação para redefinir sua senha.\n\n"
        f"Use este link, válido por 20 minutos e para uma única utilização:\n{reset_url}\n\n"
        "Se você não solicitou esta alteração, ignore esta mensagem.",
    )


def send_class_alert_email(recipient: str, title: str, body: str) -> None:
    _send_email(recipient, title, body)


def _send_email(recipient: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    use_ssl = _bool_env("SMTP_USE_SSL", False)

    if not host or not sender:
        raise EmailDeliveryError("O serviço de e-mail não está configurado.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    try:
        context = ssl.create_default_context()
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=10, context=context) as client:
                if username:
                    client.login(username, password)
                client.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=10) as client:
                client.ehlo()
                if _bool_env("SMTP_STARTTLS", True):
                    client.starttls(context=context)
                    client.ehlo()
                if username:
                    client.login(username, password)
                client.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("Não foi possível enviar o e-mail de recuperação.") from exc
