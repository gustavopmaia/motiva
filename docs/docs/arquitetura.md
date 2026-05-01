---
sidebar_position: 3
title: Arquitetura
---

# Arquitetura

O sistema é organizado em três camadas: campo (coleta), backend (processamento) e operação (execução).

## Visão em camadas

```
┌─────────────────────────────────────────────┐
│  CAMPO                                      │
│  Satélite Sentinel-2 · Veículo · IoT/MQTT  │
└────────────────────┬────────────────────────┘
                     │ leituras
┌────────────────────▼────────────────────────┐
│  BACKEND (NestJS)                           │
│                                             │
│  HTTP/MQTT → Readings → Fusion              │
│                            │ score cruzou   │
│                         AlertsProcessor     │
│                            │ alerta criado  │
│                      WorkOrdersProcessor    │
│                            │ OS criada      │
│                       DispatchService       │
│                            │ rotas geradas  │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  OPERAÇÃO                                   │
│  Manager revisa · Equipe executa            │
└─────────────────────────────────────────────┘
```

## Componentes do backend

| Componente            | Responsabilidade                                                |
| --------------------- | --------------------------------------------------------------- |
| `ReadingsController`  | Recebe leituras via HTTP com autenticação por API Key           |
| `ReadingsMqttHandler` | Recebe leituras de sensores IoT via MQTT                        |
| `ReadingsService`     | Valida, persiste leituras e delega ao FusionService             |
| `FusionService`       | Calcula score por segmento e enfileira evento se limiar cruzado |
| `AlertsProcessor`     | Cria ou reutiliza alerta aberto, enfileira criação de OS        |
| `WorkOrdersProcessor` | Cria OS e vincula seu ID ao alerta                              |
| `WorkOrdersService`   | CRUD de OSs, conclusão atômica via transação Drizzle            |
| `DispatchService`     | Gera rotas por equipe a partir das OSs abertas                  |
| `DispatchCronService` | Reagenda despacho automaticamente via cron                      |
| `AlertsService`       | CRUD de alertas e lógica de abertura/fechamento                 |
| `AuthService`         | Registro, login, API keys e reset de senha                      |

## Filas BullMQ

O processamento assíncrono usa duas filas Redis:

```
readings-events
  └─ AlertsProcessor
        → cria ou reutiliza alerta aberto
        → enfileira CreateWorkOrderJob

alerts-events
  └─ WorkOrdersProcessor
        → cria OS
        → vincula osId ao alerta
```

As filas garantem que falhas transitórias (ex: banco indisponível) sejam retentadas automaticamente. O `AlertsProcessor` é **idempotente**: mesmo que o job seja reprocessado, ele reutiliza o alerta existente em vez de criar duplicatas.

## Banco de dados

PostgreSQL com extensão **PostGIS** para armazenar a geometria (LineString) de cada segmento. ORM: Drizzle com migrations versionadas.

### Schema principal

```
road_segments
  ├── readings (leituras individuais por fonte)
  ├── alerts   (alertas gerados por limiar)
  │     └── work_orders (OSs geradas por alerta)
  └── (geometria PostGIS para busca por localização)

teams
  └── team_segments (km cobertos por equipe)
        └── routes
              └── route_items (OSs na rota)
```

### Busca por localização

Quando uma leitura chega com `lat/lon`, o sistema encontra o segmento mais próximo automaticamente:

```sql
ORDER BY ST_Distance(geometry::geography,
  ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)
LIMIT 1
```

## Autenticação

Dois mecanismos coexistem:

| Quem                              | Mecanismo  | Header                          |
| --------------------------------- | ---------- | ------------------------------- |
| Usuários (manager, field)         | JWT Bearer | `Authorization: Bearer <token>` |
| Sensores (IoT, veículo, satélite) | API Key    | `X-Api-Key: <chave>`            |

As API Keys são criadas pelo manager e armazenadas como hash SHA-256 — a chave raw é exibida apenas no momento da criação.

## Deploy

```
GitHub Actions CI
  ├── test     → npm test (ts-jest, sem banco)
  ├── publish  → docker build + push GHCR (com layer cache)
  └── deploy   → SSH no EC2: pull + migrate + up
```

O build Docker usa **multi-stage**: instala dependências, compila TypeScript, descarta devDependencies. A imagem final roda apenas o `dist/`.
