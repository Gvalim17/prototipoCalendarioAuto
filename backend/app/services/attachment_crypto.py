"""Cifragem em nível de aplicação para os bytes de anexos de aula (LGPD —
proteção adicional em repouso além da criptografia de disco do provedor).
Usa Fernet (AES-128-CBC + HMAC-SHA256 autenticado) da lib `cryptography`."""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken

# Sem ATTACHMENT_ENCRYPTION_KEY configurada, gera uma chave efêmera por
# processo — funciona em dev, mas em produção é obrigatório definir a
# variável de ambiente com uma chave persistente (senão cada reinício do
# servidor torna os anexos já gravados indecifráveis).
_EPHEMERAL_KEY = Fernet.generate_key()


class AttachmentDecryptionError(Exception):
    pass


def _fernet() -> Fernet:
    key = os.getenv("ATTACHMENT_ENCRYPTION_KEY", "").strip().encode("utf-8") or _EPHEMERAL_KEY
    return Fernet(key)


def encrypt_attachment(data: bytes) -> bytes:
    return _fernet().encrypt(data)


def decrypt_attachment(data: bytes) -> bytes:
    try:
        return _fernet().decrypt(data)
    except InvalidToken as exc:
        raise AttachmentDecryptionError(
            "Não foi possível decifrar o anexo — a chave de cifragem pode ter mudado."
        ) from exc
