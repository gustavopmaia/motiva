---
sidebar_position: 6
title: Backend
---

# Backend

Referência técnica da API e do servidor do Motiva.

## Stack

| Tecnologia                  | Uso                                                 |
| --------------------------- | --------------------------------------------------- |
| **NestJS**                  | Framework HTTP e estrutura de módulos               |
| **PostgreSQL + PostGIS**    | Banco de dados com suporte a geometria de segmentos |
| **Drizzle ORM**             | Query builder tipado e migrations versionadas       |
| **BullMQ + Redis**          | Filas de processamento assíncrono                   |
| **MQTT**                    | Recepção de leituras de sensores IoT em tempo real  |
| **JWT + argon2**            | Autenticação de usuários                            |
| **Docker + GitHub Actions** | Build e deploy contínuo                             |

## Variáveis de ambiente

```env
DATABASE_URL=postgresql://user:password@host:5432/motiva
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu-segredo-forte
PORT=3000
```

## Autenticação

### Usuários — JWT Bearer

```
POST /api/v1/auth/login
→ { accessToken: "eyJ..." }
```

Enviar em todas as requisições protegidas:

```
Authorization: Bearer <accessToken>
```

**Roles:**

- `manager` — acesso total, registra usuários e cria API Keys
- `field` — acesso às OSs para execução

### Sensores — API Key

```
X-Api-Key: <chave-raw-gerada-no-registro>
```

A chave é armazenada como hash SHA-256. A chave raw é exibida **uma única vez** no momento da criação — guarde imediatamente.

---

## Endpoints

### Autenticação

```
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me            [JWT]
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/api-keys      [JWT, manager]
```

**Registrar usuário:**

```json
POST /api/v1/auth/register
Authorization: Bearer <token-do-manager>

{
  "email": "equipe@motiva.app",
  "name": "Equipe Norte",
  "password": "senha-forte-1",
  "role": "field"
}
```

O campo `role` aceita `"field"` (padrão) ou `"manager"`. Requer JWT de um manager.

**Criar API Key:**

```json
POST /api/v1/auth/api-keys
Authorization: Bearer <token-do-manager>

{
  "name": "sensor-iot-km10",
  "source": "iot"
}
→ { "key": "<chave-raw>", ... }
```

`source` aceita: `iot`, `vehicle`, `satellite`.

---

### Leituras

```
POST /api/v1/readings    [API Key]
```

A leitura é automaticamente associada ao segmento mais próximo usando `ST_Distance`.

**IoT:**

```json
{
  "source": "iot",
  "lat": -27.5,
  "lon": -48.5,
  "heightCm": 45
}
```

**Veículo:**

```json
{
  "source": "vehicle",
  "lat": -27.5,
  "lon": -48.5,
  "classification": "urgent",
  "confidence": 0.9
}
```

`classification`: `ok`, `attention`, `urgent`. `confidence` entre 0 e 1 (ou 0–100, normalizado automaticamente).

**Satélite:**

```json
{
  "source": "satellite",
  "lat": -27.5,
  "lon": -48.5,
  "ndvi": 0.65
}
```

**Via MQTT:**

```
Tópico: sensors/{node_id}/reading
Payload: mesmo formato acima
```

---

### Segmentos de rodovia

```
GET /api/v1/road-segments    [JWT]
```

Retorna todos os segmentos com score atual e flag de divergência.

---

### Alertas

```
GET /api/v1/alerts    [JWT]
```

Retorna todos os alertas ordenados por data de criação.

---

### Ordens de Serviço

```
GET   /api/v1/work-orders              [JWT]
POST  /api/v1/work-orders              [JWT, manager]
PATCH /api/v1/work-orders/:id          [JWT]
POST  /api/v1/work-orders/:id/complete [JWT]
```

**Listar com filtros:**

```
GET /api/v1/work-orders?status=open&team=Equipe+Norte
```

`status`: `open`, `in_progress`, `completed`.

**Atualizar:**

```json
PATCH /api/v1/work-orders/:id
{
  "status": "in_progress",
  "team": "Equipe Norte",
  "observation": "Vegetação alta na faixa direita"
}
```

**Concluir** — operação atômica que fecha o alerta e zera o score do segmento:

```
POST /api/v1/work-orders/:id/complete
```

---

## Módulos NestJS

```
AppModule
  ├── AuthModule          (usuários, API keys, JWT, guards)
  ├── ReadingsModule      (ingestão HTTP e MQTT, FusionService)
  ├── AlertsModule        (alertas, AlertsProcessor)
  ├── WorkOrdersModule    (OSs, despacho, WorkOrdersProcessor)
  └── RoadSegmentsModule  (listagem de segmentos)
```

## Filas BullMQ

```
readings-events  →  AlertsProcessor
alerts-events    →  WorkOrdersProcessor
```

Ambas as filas são conectadas ao Redis configurado via `REDIS_URL`.

## Migrations

```bash
# Gerar nova migration após alterar o schema
npm run generate --workspace=backend

# Aplicar migrations pendentes
npm run build --workspace=backend
npm run migrate --workspace=backend
```

No deploy, as migrations são executadas automaticamente antes de subir o container:

```bash
docker compose run --rm --no-deps backend npm run --workspace backend migrate
```

## Deploy

O pipeline do GitHub Actions faz:

1. `npm test` — testes unitários via ts-jest (sem banco, sem Redis)
2. `docker build` — compila TypeScript, descarta devDeps, publica imagem no GHCR
3. SSH no EC2: `docker pull` + `migrate` + `docker compose up`

A imagem é versionada por SHA do commit além do tag `latest`.
