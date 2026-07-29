## O que este PR muda

<!-- Descreva o que mudou e por quê. Se resolve uma issue, referencie com "Closes #123". -->

## Como testar

<!-- Passos para reproduzir/validar manualmente, se aplicável. -->

## Checklist

- [ ] `pytest tests/ -v` passa no backend (se você mudou algo lá)
- [ ] `npm run build` passa no frontend (typecheck + build, se você mudou algo lá)
- [ ] Se mudou um modelo em `backend/app/models/base.py`, criei a migração Alembic correspondente
- [ ] Testei manualmente o fluxo que mudou (não só os testes automatizados)
