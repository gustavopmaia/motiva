---
sidebar_position: 3
title: Backend
---

# Backend

## Stack

| Tecnologia              | Uso                                           |
| ----------------------- | --------------------------------------------- |
| NestJS                  | Framework HTTP e estrutura de módulos         |
| PostgreSQL + PostGIS    | Banco com suporte a geometria de segmentos    |
| Drizzle ORM             | Query builder tipado e migrations versionadas |
| BullMQ + Redis          | Filas de processamento assíncrono             |
| MQTT (Mosquitto)        | Recepção de leituras dos sensores IoT         |
| JWT + Argon2            | Autenticação de usuários                      |
| Docker + GitHub Actions | Build e deploy contínuo via GHCR              |

## Como rodar localmente

```bash
# Instalar dependências
npm ci

# Subir banco, Redis e MQTT
docker compose up -d postgres redis mosquitto

# Aplicar migrations
npm run migrate --workspace=backend

# Iniciar o servidor
npm run start:dev --workspace=backend
```

O servidor sobe na porta `3000` por padrão.

## Variáveis de ambiente

```env
DATABASE_URL=postgresql://user:password@localhost:5432/rocadinha
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu-segredo-forte-aqui
PORT=3000
MQTT_URL=mqtt://localhost:1883
```

## Migrations

```bash
# Gerar migration após alterar o schema Drizzle
npm run generate --workspace=backend

# Aplicar migrations pendentes
npm run migrate --workspace=backend
```

No deploy em produção, as migrations rodam antes de subir o container:

```bash
docker compose run --rm --no-deps backend npm run --workspace backend migrate
```

---

## Autenticação

### Usuários — JWT Bearer

```
POST /api/v1/auth/login
→ { "accessToken": "eyJ..." }
```

Enviar em todas as requisições de usuário:

```
Authorization: Bearer <accessToken>
```

Roles:

- `manager` — acesso total: registra usuários, cria API Keys, aprova rotas
- `field` — acesso às ordens de serviço para execução

Token expira em 24h.

### Sensores — API Key

```
X-Api-Key: <chave-raw-gerada-no-cadastro>
```

A chave é armazenada como hash SHA-256. A chave raw é exibida **uma única vez** no momento do cadastro.

---

## Endpoints

### Auth

**Registrar usuário**

```
POST /api/v1/auth/register
Authorization: Bearer <token-manager>
```

```json
{
  "email": "joao@empresa.com",
  "name": "João Silva",
  "password": "Senha@Forte1",
  "role": "field"
}
```

`role` aceita `"field"` ou `"manager"`. Requer JWT de um manager.

**Login**

```
POST /api/v1/auth/login
```

```json
{
  "email": "joao@empresa.com",
  "password": "Senha@Forte1"
}
```

```json
→ { "accessToken": "eyJ..." }
```

**Perfil atual**

```
GET /api/v1/auth/me
Authorization: Bearer <token>
```

**Esqueci a senha**

```
POST /api/v1/auth/forgot-password
```

```json
{ "email": "joao@empresa.com" }
```

Gera um código de 6 dígitos com validade de 15 minutos. Máximo de 3 tentativas.

**Reset de senha**

```
POST /api/v1/auth/reset-password
```

```json
{
  "email": "joao@empresa.com",
  "code": "112233",
  "newPassword": "NovaSenha@2"
}
```

**Criar API Key**

```
POST /api/v1/auth/api-keys
Authorization: Bearer <token-manager>
```

```json
{
  "name": "sensor-iot-km10",
  "source": "iot"
}
```

```json
→ { "key": "<chave-raw>", "id": "...", "name": "sensor-iot-km10" }
```

`source` aceita: `"iot"`, `"vehicle"`, `"satellite"`.

---

### Leituras

```
POST /api/v1/readings
X-Api-Key: <chave-do-sensor>
```

A leitura é automaticamente associada ao segmento mais próximo via `ST_Distance` sobre a geometria PostGIS.

**Payload IoT:**

```json
{
  "source": "iot",
  "lat": -27.5954,
  "lon": -48.548,
  "heightCm": 45
}
```

**Payload veículo:**

```json
{
  "source": "vehicle",
  "lat": -27.5954,
  "lon": -48.548,
  "classification": "urgent",
  "confidence": 0.92
}
```

`classification`: `"ok"`, `"attention"`, `"urgent"`. `confidence` aceita 0–1 ou 0–100 (normalizado automaticamente).

**Payload satélite:**

```json
{
  "source": "satellite",
  "lat": -27.5954,
  "lon": -48.548,
  "ndvi": 0.61
}
```

`ndvi` válido entre 0.2 e 0.7. Valores abaixo de 0.2 resultam em score 0; acima de 0.7, score 100.

**Via MQTT** — mesmo payload, publicado no tópico `sensors/{nodeId}/reading`.

---

### Segmentos de rodovia

**Listar todos**

```
GET /api/v1/road-segments
Authorization: Bearer <token>
```

```json
→ [
  {
    "id": "uuid",
    "highway": "BR-101",
    "kmStart": 0,
    "kmEnd": 1,
    "scoreCurrent": 42.5,
    "scoreDivergent": false
  }
]
```

---

### Alertas

**Listar todos**

```
GET /api/v1/alerts
Authorization: Bearer <token>
```

```json
→ [
  {
    "id": "uuid",
    "segmentId": "uuid",
    "level": "urgent",
    "osId": "uuid",
    "createdAt": "2025-01-01T10:00:00Z",
    "closedAt": null
  }
]
```

---

### Ordens de Serviço

**Listar**

```
GET /api/v1/work-orders
Authorization: Bearer <token>
```

Filtros opcionais via query string:

```
GET /api/v1/work-orders?status=open&team=Equipe+Norte
```

`status`: `open`, `in_progress`, `completed`.

**Criar manualmente**

```
POST /api/v1/work-orders
Authorization: Bearer <token-manager>
```

```json
{
  "segmentId": "uuid",
  "alertId": "uuid",
  "priority": "urgent",
  "team": "Equipe Norte"
}
```

**Atualizar**

```
PATCH /api/v1/work-orders/:id
Authorization: Bearer <token>
```

```json
{
  "status": "in_progress",
  "team": "Equipe Norte",
  "observation": "Vegetação alta na faixa direita"
}
```

**Concluir**

```
POST /api/v1/work-orders/:id/complete
Authorization: Bearer <token>
```

Operação atômica — em uma única transação de banco:

1. `work_orders.status` → `"completed"` e `completed_at` = now
2. `road_segments.score_current` → `0` e `score_divergent` → `false`
3. `alerts.closed_at` → now

---

## Módulos NestJS

```
AppModule
  ├── AuthModule          (usuários, API Keys, JWT, guards)
  ├── ReadingsModule      (ingestão HTTP e MQTT, FusionService)
  ├── AlertsModule        (alertas, AlertsProcessor)
  ├── WorkOrdersModule    (OSs, despacho, WorkOrdersProcessor, DispatchCronService)
  └── RoadSegmentsModule  (listagem de segmentos)
```

## Filas BullMQ

| Fila             | Worker                   | Job                          |
| ---------------- | ------------------------ | ---------------------------- |
| `segment-events` | `SegmentEventsProcessor` | `segment.risk-level-changed` |
| `alerts-events`  | `AlertEventsProcessor`   | `work-order.create`          |

Configuração de retry: `attempts: 5`, backoff exponencial a partir de 2s.

## Erros padronizados

Todos os erros seguem o mesmo envelope via `GlobalExceptionFilter`:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Work order not found"
}
```

Códigos mapeados:

| Erro de domínio          | HTTP |
| ------------------------ | ---- |
| `NotFoundError`          | 404  |
| `DuplicateResourceError` | 409  |
| `AuthorizationError`     | 403  |
| `InvalidOperationError`  | 422  |
| `UnauthorizedException`  | 401  |
