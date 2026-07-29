# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`): `MAJOR` para mudanças incompatíveis, `MINOR` para funcionalidades novas compatíveis, `PATCH` para correções.

## [Não lançado]

### Adicionado
- Central de Relatórios (`/relatorios`): total de aulas/horas lecionadas, disciplinas e instituições mais lecionadas, proporção presencial × remoto.
- Tour guiado interativo no primeiro acesso, com Central de Ajuda (`/ajuda`) para revisitar a qualquer momento.
- Importação de cronograma a partir de planilha (`.csv`/`.xls`/`.xlsx`).
- Isolamento de dados por professor em cursos, módulos e disciplinas (antes eram compartilhados entre todos).
- Cabeçalhos de segurança HTTP em toda resposta da API.
- CI (GitHub Actions), Dependabot, templates de issue/PR, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- Script de dados de exemplo (`npm run seed:back`).

### Corrigido
- Consultas N+1 nas listagens de cronograma e no `.ics` de alertas.
- Pool de conexões do banco sem `pool_pre_ping`/`pool_recycle`, causando travamentos com Postgres serverless (Neon) após período ocioso.
- Migrações do Alembic não eram aplicadas automaticamente no deploy do Render.

## [1.0.0] — versão inicial

Primeira versão funcional: cadastro de cursos/módulos/disciplinas, geração automática de cronograma com detecção de feriados/recessos, planejamento de aula (PTD e roteiro), autenticação, alertas por e-mail/calendário e exportação para Excel.
