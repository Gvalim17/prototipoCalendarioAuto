"""Testes da redação de dados sensíveis em logs (app/security.py)."""

from app.security import redact_sensitive_text


def test_redacts_compound_sqlalchemy_bind_param_keys():
    """Regressão: um traceback de erro de banco logou um hash de sessão em
    texto legível porque a regex só cobria a chave exata `token`, não
    variantes como `token_hash_1` geradas pelo SQLAlchemy para parâmetros
    posicionais."""
    text = (
        "[parameters: {'token_hash_1': 'abcdef1234567890abcdef1234567890', "
        "'password_hash_1': 'scrypt$xyz'}]"
    )
    redacted = redact_sensitive_text(text)
    assert "abcdef1234567890" not in redacted
    assert "scrypt$xyz" not in redacted


def test_redacts_single_and_double_quoted_values():
    assert "abcxyz123" not in redact_sensitive_text('session_token: "abcxyz123"')
    assert "sk-abc123" not in redact_sensitive_text('{"api_key": "sk-abc123"}')
    assert "deadbeef123" not in redact_sensitive_text("csrf_token_hash=deadbeef123")


def test_redacts_database_url_credentials():
    redacted = redact_sensitive_text("DATABASE_URL=postgresql://user:supersecret@host/db")
    assert "supersecret" not in redacted


def test_does_not_redact_unrelated_fields():
    redacted = redact_sensitive_text("{'email_1': 'a@b.com', 'name_1': 'Fulano'}")
    assert "a@b.com" in redacted
    assert "Fulano" in redacted
