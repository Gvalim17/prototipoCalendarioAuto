# Contribuindo com o CronEdu

Obrigado pelo interesse em contribuir! Este documento cobre o que o [README](README.md#começando-desenvolvimento-local) não entra em detalhe: convenções de código, como propor mudanças maiores e o que esperar do processo de revisão.

Ao contribuir, você concorda em seguir o [Código de Conduta](CODE_OF_CONDUCT.md) do projeto.

## Antes de começar a codar

- **Mudança pequena** (bug óbvio, typo, ajuste de UI pontual): pode abrir o PR direto.
- **Mudança grande** (nova funcionalidade, mudança de schema, refatoração ampla): abra uma issue descrevendo o problema e a proposta antes de investir tempo codando — evita retrabalho caso a abordagem precise mudar.
- Vulnerabilidades de segurança **não** vão em issue pública — veja [SECURITY.md](SECURITY.md).

## Configurando o ambiente

Siga [Começando (desenvolvimento local)](README.md#começando-desenvolvimento-local) no README. Resumo rápido:

```bash
npm run install:all
source backend/.venv/bin/activate   # Windows: .venv\Scripts\activate
npm run setup:back
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

## Convenções de código

- **Identificadores em inglês** (nomes de funções, classes, variáveis, tabelas, endpoints) — segue o padrão já usado em todo o repositório.
- **Comentários e textos voltados ao usuário em português** — é o idioma do público-alvo do sistema.
- **Tipagem sempre**: type hints em todo código Python novo; TypeScript (sem `any` solto) no frontend.
- **Sem comentário óbvio**: comente o *porquê* de algo não-óbvio (uma decisão, uma limitação, um workaround), não o *o quê* — o código já diz o que faz.
- **Sem abstração prematura**: resolva o problema pedido; não generalize para casos hipotéticos.

### Backend (FastAPI)

- Um router por domínio em `app/routers/`; lógica de negócio mais complexa vai em `app/services/`, não direto no router.
- Toda rota que lida com dado de um professor específico precisa checar posse — veja `ensure_owner_or_admin` em `app/dependencies.py` e como é usado em `app/routers/academic.py`. Um professor **nunca** deve conseguir ler ou escrever dado de outro professor (exceto administradores).
- Toda validação de entrada usa um schema Pydantic em `app/schemas/`, nunca `dict` cru.
- Ao mudar um modelo em `app/models/base.py`, crie a migração Alembic correspondente **na mão** (`alembic revision -m "..."` e edite o arquivo gerado) — este projeto não usa `--autogenerate`, para manter controle explícito sobre o que cada migração faz e garantir que seja não-destrutiva.

### Frontend (React + TypeScript)

- Um componente de página por rota em `src/pages/`; componentes reutilizados entre páginas vão em `src/components/`.
- Erros para o usuário usam o sistema de toast (`useToast()` de `src/contexts/ToastContext.tsx`) — nunca `alert()`/`window.confirm()` do navegador. Para confirmações, use `useConfirm()` (`src/contexts/ConfirmContext.tsx`).
- Chamadas à API sempre pelo client central (`src/api/client.ts`), nunca `fetch`/`axios` direto — é ele que cuida do token CSRF e da sessão expirada.
- Tipos compartilhados com o formato de resposta do backend ficam em `src/types/domain.ts`.

## Testes

```bash
# Backend
cd backend && source .venv/bin/activate && pytest tests/ -v

# Frontend (typecheck + build de produção)
cd frontend && npm run build
```

Toda mudança de comportamento no backend deveria vir com um teste Pytest cobrindo o caso (sucesso e, quando fizer sentido, o caso de acesso negado/dado inválido). O CI (GitHub Actions) roda essas duas checagens em todo Pull Request.

## Commits e Pull Requests

- Mensagens de commit descritivas, focando no *porquê* da mudança. [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`...) é bem-vindo, mas não obrigatório.
- Um PR deve fazer uma coisa. PRs grandes demais (mudança de funcionalidade + refactor + formatação em um só) demoram mais para revisar e são mais arriscados de aprovar.
- Preencha o checklist do template de PR antes de abrir.
- Espere feedback na revisão — é normal pedir ajustes antes de aprovar, especialmente em rotas que lidam com dado de usuário ou autenticação.

## Dúvidas

Abra uma issue com sua dúvida, ou veja a [Central de Ajuda](frontend/src/pages/Help.tsx) dentro do próprio sistema para entender o comportamento esperado de cada funcionalidade do ponto de vista do usuário.
