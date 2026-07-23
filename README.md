# Orquestrador de Calendário Automático

Sistema para geração e gerenciamento de calendários acadêmicos de MBAs, com automação de datas, detecção de feriados/recessos, ajuste manual de conflitos e exportação para Excel.

---

## Pré-requisitos

- **Node.js** v18 ou superior
- **Python** v3.10 ou superior
- **Git**

---

## Instalação (primeira vez)

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/prototipoCalendarioAuto.git
cd prototipoCalendarioAuto
```

### 2. Instalar dependências

**Mac / Linux:**
```bash
npm run install:all
source backend/.venv/bin/activate
npm run setup:back
```

**Windows:**
```bash
npm run install:all
.\backend\.venv\Scripts\activate
npm run setup:back
```

`install:all` instala as dependências do Node (raiz e frontend) e cria o ambiente virtual Python. `setup:back` instala os pacotes Python dentro do `.venv`.

---

## Como rodar

Com as dependências instaladas, sempre ative o `.venv` antes de subir o projeto:

**Mac / Linux:**
```bash
source backend/.venv/bin/activate
npm run dev
```

**Windows:**
```bash
.\backend\.venv\Scripts\activate
npm run dev
```

Isso sobe backend e frontend simultaneamente.

| Serviço | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API (backend) | http://localhost:8000 |
| Documentação interativa da API | http://localhost:8000/docs |

---

## Estrutura do projeto

```
prototipoCalendarioAuto/
├── backend/
│   ├── app/
│   │   ├── main.py               # Endpoints FastAPI
│   │   ├── models/base.py        # Modelos SQLAlchemy (tabelas)
│   │   ├── schemas/base_schemas.py  # Schemas Pydantic (validação)
│   │   ├── services/schedule_generator.py  # Lógica de geração de cronograma
│   │   └── utils/
│   │       ├── holidays_2026.json   # Feriados pré-carregados
│   │       └── seed_data.py         # Dados de exemplo
│   ├── requirements.txt
│   └── .venv/                    # Ambiente virtual Python (gerado localmente)
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx     # Painel principal + calendário geral
│       │   ├── ScheduleForm.tsx  # Gerador de cronograma (2 etapas)
│       │   ├── MBAList.tsx       # Cadastro de MBAs, módulos e disciplinas
│       │   └── HolidayRecessList.tsx  # Gerenciamento de feriados e recessos
│       └── App.tsx
├── package.json                  # Scripts raiz (dev, install, setup)
└── README.md
```

---

## Banco de dados

O sistema usa **SQLite** por padrão. O arquivo `backend/sql_app.db` é criado automaticamente na primeira execução. Não é necessária nenhuma configuração adicional.

---

## Funcionalidades

### Cadastro acadêmico
- Criação de MBAs, módulos e disciplinas com hierarquia: MBA → Módulo → Disciplina
- Cada disciplina tem código único, formato (presencial/remoto) e carga horária

### Feriados e recessos
- Cadastro manual ou importação via arquivo `.csv` ou `.xlsx`
- Feriados bloqueiam automaticamente a geração de aulas naquelas datas
- Recessos cobrem intervalos de datas (início a fim)

### Gerador de cronograma (RF-06)
O gerador cria automaticamente a lista de datas de aulas com base em:
- Data inicial
- Recorrência: **Semanal**, **Quinzenal** ou **Master Class (Evento Único)**
- Quantidade de aulas (ignorado para Master Class — sempre 1)
- Dia da semana

Datas que caem em feriados ou recessos são puladas automaticamente. O sistema registra cada data pulada com o motivo.

### Master Class — primeiro dia do módulo (RF-11)
Ao selecionar **"Master Class (Evento Único)"** como recorrência, o sistema agenda exatamente uma aula na data escolhida, independente do padrão de recorrência das demais disciplinas do módulo. O resultado é exibido com badge roxo "MASTER CLASS" no calendário e na lista.

### Ajuste manual de conflitos (RF-09)
Após gerar um cronograma, os conflitos detectados (datas puladas por feriado ou recesso) aparecem na seção "Detecção de Conflitos". Para cada conflito:

1. Clique em **"Repor Data"** para abrir o seletor de datas inline
2. Escolha a data de reposição (feriados ficam desabilitados)
3. O sistema pergunta: **"Recalcular todo o cronograma?"**
   - **Sim, Recalcular** — regenera todas as aulas a partir da configuração original, revalidando conflitos futuros
   - **Não, apenas adicionar** — insere só aquela data de reposição no cronograma sem alterar as demais

### Exportação para Excel (RF-12)
- **Dashboard → botão "Exportar .xlsx"**: baixa todos os cronogramas salvos
- **Step 2 do gerador → botão ".xlsx"**: baixa o cronograma gerado antes mesmo de salvá-lo

O arquivo exportado contém as colunas: MBA, Módulo, Disciplina, Formato, Data, Dia da Semana, Nº da Aula, Carga Horária (h).

### Dashboard e calendário geral
- Visão geral de MBAs, módulos, disciplinas e feriados cadastrados
- Próximas aulas e feriados
- Calendário mensal com todas as aulas agendadas sobrepostas com feriados

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe backend e frontend simultaneamente |
| `npm run dev:back` | Sobe apenas o backend (requer `.venv` ativo) |
| `npm run dev:front` | Sobe apenas o frontend |
| `npm run install:all` | Instala dependências Node e cria o `.venv` Python |
| `npm run setup:back` | Instala pacotes Python no `.venv` (requer `.venv` ativo) |
| `npm run migrate:back` | Aplica migrações Alembic no backend |

Em produção, configure `AUTO_CREATE_TABLES=false` e execute `npm run migrate:back` no deploy. Para proteger endpoints destrutivos em massa, configure `ADMIN_ACTION_TOKEN`; quando definido, o backend exige o header `X-Admin-Action-Token`.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.10+, FastAPI, SQLAlchemy, Uvicorn |
| Banco de dados | SQLite (desenvolvimento) |
| Exportação | Pandas + Openpyxl |
| Frontend | React 18, TypeScript, Vite |
| Estilo | Tailwind CSS |
| Ícones | Lucide React |
| HTTP | Axios |

---

## Licença

Projeto para fins de prototipagem e uso interno.
