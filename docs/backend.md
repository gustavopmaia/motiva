---
id: backend
title: Backend
---

# 📄 Backend (Documentação Técnica)

## ⚙️ Backend

### Stack

- NestJS
- PostgreSQL
- Drizzle ORM
- BullMQ + Redis
- MQTT (Mosquitto)
- Docker
- GitHub Actions

---

### Ingestão de dados

#### HTTP

```txt
POST /readings
```

---

### MQTT

```txt
topic: sensors/{node_id}/reading
```

Subscriber consome e chama a API.

---

### Pipeline

```txt
readings → segment → fusion → score → alert → work_order
```

---

### Motor de Fusão

Combina:

- IoT
- Veículo
- Satélite

Gera score 0–100.

---

### Regras principais

- pesos por fonte
- fallback quando fonte ausente
- detecção de divergência
- thresholds de ação

---

### Alertas

Criados quando score cruza threshold.

---

### Work Orders

Criadas automaticamente.

---

### Dispatch

Responsável por:

- organizar OS por equipe
- dividir por dia
- ordenar por prioridade
- respeitar capacidade

---

### Estruturas principais

#### work_orders

- segment_id
- priority
- status

---

#### teams

- capacity_per_day
- base_location

---

#### team_segments

- km_start
- km_end

---

#### routes

- team_id
- date
- status

---

#### route_items

- work_order_id
- order_index

---

### Execução

- criação de OS → entra no pool
- dispatch → gera rotas
- gestor aprova
- equipe executa
- conclusão fecha ciclo
