"""Password and browser-session primitives used by the authentication API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets


SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1

_SENSITIVE_VALUE = re.compile(
    r"(?i)(password|senha|token|secret|authorization|cookie|api[_-]?key|database_url)\w*"
    r"(\s*[=:]\s*|\"\s*:\s*\"|'\s*:\s*')"
    r"([^\s,;\"']+|\"[^\"]*\"|'[^']*')"
)
_DATABASE_URL = re.compile(r'(?i)(postgres(?:ql)?://[^:\s/]+:)[^@\s]+(@)')
_EPHEMERAL_FINGERPRINT_SALT = os.urandom(32)


def redact_sensitive_text(value: str) -> str:
    """Prevent credentials from reaching files, consoles, or the logs endpoint."""
    redacted = _DATABASE_URL.sub(r"\1[REDACTED]\2", value)
    return _SENSITIVE_VALUE.sub(r"\1\2[REDACTED]", redacted)


def fingerprint(value: str) -> str:
    """Stable pseudonymous identifier for abuse detection without logging PII."""
    salt = os.getenv("LOG_PII_SALT", "").encode("utf-8") or _EPHEMERAL_FINGERPRINT_SALT
    return hmac.new(salt, value.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        maxmem=64 * 1024 * 1024,
    )
    return "scrypt${}${}${}${}${}".format(
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.urlsafe_b64decode(salt.encode("ascii")),
            n=int(n),
            r=int(r),
            p=int(p),
            maxmem=64 * 1024 * 1024,
        )
        return hmac.compare_digest(
            digest, base64.urlsafe_b64decode(expected.encode("ascii"))
        )
    except (ValueError, TypeError, AttributeError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
