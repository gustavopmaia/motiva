---
sidebar_position: 2
title: Arquitetura
---

# Arquitetura

## Componentes

| Componente          | Tecnologia                | Função                                              |
| ------------------- | ------------------------- | --------------------------------------------------- |
| API HTTP            | NestJS                    | Ingestão de leituras, gestão de OSs e usuários      |
| Worker de segmentos | BullMQ (`segment-events`) | Fusão de score e detecção de alertas                |
| Worker de alertas   | BullMQ (`alerts-events`)  | Criação de ordens de serviço                        |
| Cron de despacho    | `@nestjs/schedule`        | Gera rotas a cada 5 minutos se houver OSs pendentes |
| Banco de dados      | PostgreSQL + PostGIS      | Armazena segmentos, leituras, alertas e OSs         |
| Cache / filas       | Redis                     | Backend das filas BullMQ                            |
| Broker MQTT         | Mosquitto                 | Recebe leituras dos sensores IoT                    |

## Arquitetura hexagonal

O backend segue arquitetura hexagonal (ports & adapters) com três camadas:

**Domain** — entidades e interfaces de repositório. Sem dependência de framework. `WorkOrder`, `Alert`, `RoadSegment`, `Reading`, `User` vivem aqui. Os repositórios são interfaces (`WorkOrderRepository`, `AlertRepository`, etc.) — nenhum código de domínio sabe que existe Drizzle ou PostgreSQL.

**Application** — casos de uso e serviços de aplicação. Orquestram o domínio e chamam as interfaces de repositório. `FusionService` calcula o score. `DispatchService` monta as rotas. `AlertsProcessor` e `WorkOrdersProcessor` são workers BullMQ registrados aqui.

**Infrastructure** — implementações concretas. Controllers HTTP, repositórios Drizzle, guard JWT, gateway MQTT, scheduler de despacho. Toda dependência de NestJS, Drizzle e bibliotecas externas fica nessa camada.

## Fluxo de eventos

```
Sensor (IoT / veículo / satélite)
  │
  ├─ HTTP POST /api/v1/readings    (API Key)
  └─ MQTT sensors/{nodeId}/reading
        │
        ▼
  ReadingsService
  ├── calcula score individual
  ├── associa ao segmento mais próximo (ST_Distance)
  └── publica job segment.risk-level-changed → fila segment-events
        │
        ▼
  SegmentEventsProcessor  (BullMQ — attempts: 5, backoff exponencial de 2s)
  ├── FusionService: busca leituras das últimas 24h por fonte
  ├── calcula média ponderada (IoT 50% · Veículo 35% · Satélite 15%)
  ├── detecta divergência (max − min > 40 pts → score_divergent = true)
  ├── atualiza score_current no segmento
  └── se score cruzou limiar (30 / 55 / 80) → publica job → fila alerts-events
        │
        ▼
  AlertEventsProcessor  (BullMQ — idempotente)
  ├── verifica se já existe alerta aberto para segmento + nível
  ├── não existe → cria novo alerta
  ├── já existe  → reutiliza
  └── cria OS vinculada ao alerta
        │
        ▼
  DispatchCronService  (cron */5 * * * *)
  └── DispatchService: agrupa OSs abertas em rotas por equipe
```

## Banco de dados

Todas as tabelas usam UUID como chave primária. PostGIS armazena a geometria dos segmentos como `LineString` no SRID 4326.

### `road_segments`

| Coluna            | Tipo                      | Descrição                                        |
| ----------------- | ------------------------- | ------------------------------------------------ |
| `id`              | uuid PK                   | Identificador do segmento                        |
| `highway`         | text                      | Código da rodovia (ex: BR-101)                   |
| `km_start`        | numeric                   | Km inicial                                       |
| `km_end`          | numeric                   | Km final                                         |
| `geometry`        | geometry(LineString,4326) | Traçado do segmento                              |
| `score_current`   | numeric                   | Score atual de vegetação (0–100)                 |
| `score_divergent` | boolean                   | True quando fontes divergem em mais de 40 pontos |
| `territory_id`    | uuid FK                   | Território responsável                           |

### `readings`

| Coluna       | Tipo        | Descrição                             |
| ------------ | ----------- | ------------------------------------- |
| `id`         | uuid PK     | Identificador da leitura              |
| `segment_id` | uuid FK     | Segmento associado                    |
| `source`     | text        | `iot` / `vehicle` / `satellite`       |
| `sensor_id`  | uuid FK     | Sensor que gerou a leitura            |
| `score`      | numeric     | Score calculado desta leitura (0–100) |
| `raw_value`  | jsonb       | Payload original da leitura           |
| `read_at`    | timestamptz | Quando a leitura foi coletada         |

### `alerts`

| Coluna       | Tipo        | Descrição                                   |
| ------------ | ----------- | ------------------------------------------- |
| `id`         | uuid PK     | Identificador do alerta                     |
| `segment_id` | uuid FK     | Segmento em alerta                          |
| `level`      | text        | `attention` / `urgent` / `critical`         |
| `os_id`      | uuid FK     | OS gerada para este alerta                  |
| `created_at` | timestamptz | Quando o alerta foi aberto                  |
| `closed_at`  | timestamptz | Quando o alerta foi fechado (null = aberto) |

### `work_orders`

| Coluna              | Tipo        | Descrição                                |
| ------------------- | ----------- | ---------------------------------------- |
| `id`                | uuid PK     | Identificador da OS                      |
| `segment_id`        | uuid FK     | Segmento a ser atendido                  |
| `alert_id`          | uuid FK     | Alerta que originou a OS                 |
| `status`            | text        | `open` / `in_progress` / `completed`     |
| `priority`          | text        | `normal` / `urgent` / `critical`         |
| `score_at_creation` | numeric     | Score do segmento quando a OS foi criada |
| `team`              | text        | Equipe designada                         |
| `observation`       | text        | Observações da conclusão                 |
| `created_at`        | timestamptz | Criação                                  |
| `started_at`        | timestamptz | Início da execução                       |
| `completed_at`      | timestamptz | Conclusão                                |

### `sensors`

| Coluna         | Tipo        | Descrição                              |
| -------------- | ----------- | -------------------------------------- |
| `id`           | uuid PK     | Identificador do sensor                |
| `node_id`      | text unique | ID do nó físico (usado no tópico MQTT) |
| `type`         | text        | `iot` / `vehicle` / `satellite`        |
| `api_key_hash` | text        | Hash SHA-256 da API Key                |

### `users`

| Coluna                  | Tipo        | Descrição                    |
| ----------------------- | ----------- | ---------------------------- |
| `id`                    | uuid PK     | Identificador                |
| `email`                 | text unique | E-mail                       |
| `name`                  | text        | Nome                         |
| `password_hash`         | text        | Hash Argon2                  |
| `role`                  | text        | `manager` / `field`          |
| `reset_code`            | text        | Código de reset de senha     |
| `reset_code_expires_at` | timestamptz | Expiração do código (15 min) |
| `reset_attempts`        | int         | Tentativas de reset (máx. 3) |

## Autenticação

**Usuários (JWT)** — login retorna token JWT com expiração de 24h. O guard `JwtAuthGuard` implementa `CanActivate` diretamente com `JwtService.verify()`. Não usa Passport.

**Sensores (API Key)** — cada sensor tem uma API Key única gerada no cadastro. O header `X-Api-Key` é recebido, aplicado SHA-256 e comparado com o hash armazenado. A chave raw é exibida apenas no momento da criação.

## Deploy

```
GitHub Actions
  ├── test     → npm test (ts-jest, sem banco, sem Redis)
  ├── publish  → docker build + push GHCR (layer cache habilitado)
  └── deploy   → SSH no EC2: git pull + migrate + docker compose up
```

Build multi-stage: instala dependências, compila TypeScript, descarta devDependencies. A imagem final executa apenas o `dist/`. A imagem é tagueada com `:latest` e com o SHA do commit.
