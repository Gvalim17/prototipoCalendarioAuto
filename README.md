# 🗓️ Orquestrador de Calendário Automático

Um sistema inteligente para geração e gerenciamento de calendários acadêmicos e corporativos, com foco em automação de datas, feriados e otimização de cronogramas.

---

## 🚀 Tecnologias Utilizadas

### **Backend**
- [Python 3.10+](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/) (Framework web de alta performance)
- [SQLAlchemy](https://www.sqlalchemy.org/) (ORM para banco de dados)
- [Uvicorn](https://www.uvicorn.org/) (Servidor ASGI)
- [Pandas/Openpyxl](https://pandas.pydata.org/) (Manipulação de dados e Excel)

### **Frontend**
- [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide React](https://lucide.dev/) (Ícones)
- [Axios](https://axios-http.com/) (Comunicação com API)

---

## 📋 Pré-requisitos

Antes de começar, verifique se você tem instalado:
- **Node.js** (v18 ou superior)
- **Python** (v3.10 ou superior)
- **Git**

---

## 🛠️ Instalação e Configuração

Siga os passos abaixo para rodar o projeto em sua máquina local.

### 1. Clonar o Repositório
```bash
git clone https://github.com/seu-usuario/prototipoCalendarioAuto.git
cd prototipoCalendarioAuto
```

### 2. Configuração Automática (Recomendado)
O projeto possui scripts configurados para facilitar o setup.

**No Windows:**
```bash
npm run install:all
# Após criar o venv, ative-o:
.\backend\.venv\Scripts\activate
# Instale as dependências do backend:
npm run setup:back
```

**No Mac / Linux:**
```bash
npm run install:all
# Após criar o venv, ative-o:
source backend/.venv/bin/activate
# Instale as dependências do backend:
npm run setup:back
```

---

## 🏃‍♂️ Como Executar

Com as dependências instaladas, você pode rodar o backend e o frontend simultaneamente com um único comando na raiz do projeto:

```bash
npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend (API):** [http://localhost:8000](http://localhost:8000)
- **Documentação API (Docs):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 💡 Dicas Adicionais

### Ativação do Ambiente Virtual (Python)
Sempre que for trabalhar no backend isoladamente, lembre-se de ativar o ambiente virtual:
- **Windows:** `.\backend\.venv\Scripts\activate`
- **Mac/Linux:** `source backend/.venv/bin/activate`

### Banco de Dados
O sistema utiliza **SQLite** por padrão para desenvolvimento. O arquivo `sql_app.db` será gerado automaticamente na primeira execução do backend dentro da pasta `backend/`.

---

## 📄 Licença
Este projeto é para fins de prototipagem e uso interno.
