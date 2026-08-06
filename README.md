# Challenge FIAP - Motiva

Monorepo com backend e web/webview do challenge da Motiva.

Monitoramento de vegetação em rodovias: leituras de sensores IoT, inspeção veicular e
índice de satélite são fundidas em um score por trecho, que abre alertas e gera ordens
de serviço distribuídas automaticamente entre as equipes de campo.

## Como rodar

Pré-requisitos: Node `24.14.0` (ver `.nvmrc`) e Docker.

```bash
npm install
cp apps/backend/.env.example apps/backend/.env   # preencha os valores
docker compose up -d postgres redis
npm run migrate --workspace=backend
npm run dev
```

No `.env` local, use `NODE_ENV=development` — o valor de `production` do exemplo é o de deploy.

### Dados de demonstração

Popula o banco com trechos da BR-101, leituras das três fontes, alertas, OSs e as
rotas que o despacho monta a partir delas. Idempotente: rodar de novo não duplica nada.

```bash
npm run build --workspace=backend   # o seed roda a partir de dist/
npm run seed --workspace=backend
```

Cria `gestor@motiva.com` (manager) e `campo@motiva.com` (field), senha `motiva123`
(ou `SEED_PASSWORD`). Recusa rodar com `NODE_ENV=production` a menos que `SEED_FORCE=1`.

## Apps

- `apps/backend` — API REST (NestJS + Drizzle + BullMQ + MQTT)
- `apps/web` — Dashboard web + PWA (Vite + React)
- `docs` — documentação técnica (Docusaurus)

## Backend

```bash
npm run lint --workspace=backend
npm run check-types --workspace=backend
npm test --workspace=backend                 # unitários, sem banco
npm run test:integration --workspace=backend # exige TEST_DATABASE_URL
```

Os testes de integração rodam contra um Postgres com PostGIS e cobrem o SQL cru:
match geográfico de trecho, fusão de leituras, escopo por território e replanejamento
de rotas. Sem `TEST_DATABASE_URL` eles se auto-pulam.

```bash
docker run -d --name motiva-test-db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=motiva_test -p 55432:5432 postgis/postgis:17-3.5

TEST_DATABASE_URL=postgresql://test:test@localhost:55432/motiva_test \
  npm run test:integration --workspace=backend
```

Documentação da API em `/api/docs` com o serviço no ar.

## Extensões

- [EditorConfig for VS Code](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
- [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
