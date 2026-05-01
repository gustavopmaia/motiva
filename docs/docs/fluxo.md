---
sidebar_position: 4
title: Fluxo de Dados
---

# Fluxo de Dados

Do sensor à conclusão da ordem de serviço, passo a passo.

## Visão completa

```
1.  Sensor envia leitura (IoT, veículo ou satélite)
         │
         ▼
2.  POST /api/v1/readings  ou  MQTT sensors/{id}/reading
         │
         ▼
3.  ReadingsService
    ├── Associa leitura ao segmento mais próximo (ST_Distance)
    ├── Calcula score individual da leitura
    └── Persiste no banco
         │
         ▼
4.  FusionService
    ├── Busca leituras das últimas 24h por fonte
    ├── Calcula média ponderada (IoT 50% · Veículo 35% · Satélite 15%)
    ├── Detecta divergência entre fontes (diferença > 40 pts → score_divergent = true)
    └── Atualiza score_current do segmento
         │
         ├─── Score não cruzou limiar → fim
         │
         └─── Score cruzou limiar (30 / 55 / 80)
                   │
                   ▼
5.  Fila readings-events → AlertsProcessor
    ├── Verifica se já existe alerta aberto para o segmento e nível
    ├── Não existe → cria novo alerta
    ├── Já existe  → reutiliza (idempotente)
    └── Enfileira CreateWorkOrderJob
         │
         ▼
6.  Fila alerts-events → WorkOrdersProcessor
    ├── Cria OS com prioridade mapeada do nível
    └── Vincula ID da OS ao alerta (alert.osId)
         │
         ▼
7.  DispatchService
    └── Agrupa OSs abertas em rotas por equipe
         │
         ▼
8.  Manager revisa e aprova a rota
         │
         ▼
9.  Equipe executa
    ├── open → in_progress
    └── in_progress → completed
         │
         ▼
10. POST /api/v1/work-orders/:id/complete
    └── Transação atômica:
        ├── work_order.status    = "completed"
        ├── work_order.completed_at = now
        ├── road_segment.score_current = 0
        ├── road_segment.score_divergent = false
        └── alert.closed_at = now
```

## Mapeamento de prioridade

| Nível do alerta | Prioridade da OS |
| --------------- | ---------------- |
| Atenção (≥ 30)  | Normal           |
| Urgente (≥ 55)  | Urgente          |
| Crítico (≥ 80)  | Crítico          |

## Cálculo de score por fonte

### IoT (peso 50%)

```
score = altura_cm × 1,4   →  clamped [0, 100]
```

### Veículo (peso 35%)

```
score = valor_classificacao × confiança   →  clamped [0, 100]

ok       → 10
atenção  → 50
urgente  → 85
```

A confiança é normalizada para [0, 1] automaticamente se vier como percentual (ex: 90 → 0,9).

### Satélite (peso 15%)

```
score = (ndvi - 0,2) × 200   →  clamped [0, 100]
```

NDVI saudável vai de 0,2 (vegetação esparsa) a 0,7 (densa). Vegetação acima de 0,7 satura o score em 100.

## Fusão de score

```
score_total = Σ (score_fonte × peso_fonte / peso_total_fontes_presentes)
```

Apenas fontes com leituras nas últimas 24h participam do cálculo. Se apenas IoT enviou leituras, ele recebe peso 100% efetivo.

## Idempotência nas filas

Qualquer step pode falhar e ser retentado pelo BullMQ sem efeitos colaterais:

- **AlertsProcessor**: busca alerta aberto antes de criar um novo — retry não duplica alertas
- **WorkOrdersProcessor**: se a OS já existe para aquele alertId, o retry é inócuo

## Divergência de score

Quando `max(scores) − min(scores) > 40` entre as fontes presentes, o campo `score_divergent` é marcado como `true`. O manager pode investigar o segmento e decidir enviar uma equipe para inspeção manual antes do limiar ser cruzado.
