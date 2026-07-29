# Política de Segurança

## Reportando uma vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança neste projeto, **não abra uma issue pública**. Issues e Pull Requests são públicos, e divulgar uma falha antes de ela ser corrigida coloca em risco quem já roda o sistema em produção.

Em vez disso:

1. Use a aba **"Security" → "Report a vulnerability"** deste repositório no GitHub (Security Advisories), se disponível; ou
2. Entre em contato diretamente com os mantenedores por um canal privado.

Inclua, se possível:
- Passos para reproduzir o problema.
- O impacto que você acredita que isso tem (ex.: acesso a dados de outro professor, execução de código, etc.).
- Uma sugestão de correção, se tiver.

Vamos confirmar o recebimento em até alguns dias e trabalhar numa correção antes de qualquer divulgação pública.

## Escopo

Este sistema lida com dados pessoais de professores e coordenadores (nome, e-mail, cronogramas, planos de aula). Áreas de interesse particular para relatórios de segurança:

- Isolamento de dados entre professores (um professor conseguindo ver/editar dados de outro).
- Falhas de autenticação/autorização (bypass de login, CSRF, escalonamento de privilégio para admin).
- Vazamento de segredos (tokens, senhas, variáveis de ambiente) em respostas da API ou logs.
- Vulnerabilidades de injeção (SQL, XSS) em qualquer endpoint.

## Versões suportadas

Este projeto não segue um esquema formal de versões com suporte de longo prazo — recomendamos sempre rodar a versão mais recente da branch `main`.
