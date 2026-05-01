---
sidebar_position: 5
title: Pipeline de Dados
---

# Pipeline de Dados

Do sensor à conclusão da ordem de serviço.

## Visão completa

```
1. Sensor envia leitura
      │
      ├─ HTTP POST /api/v1/readings  (X-Api-Key)
      └─ MQTT sensors/{nodeId}/reading
            │
            ▼
2. ReadingsService
   ├── valida payload por tipo de fonte
   ├── calcula score individual
   ├── associa ao segmento mais próximo (ST_Distance)
   ├── persiste leitura no banco
   └── publica job segment.risk-level-changed → fila segment-events
            │
            ▼
3. SegmentEventsProcessor  (BullMQ worker)
   └── FusionService
       ├── busca leituras das últimas 24h por fonte
       ├── calcula score ponderado
       ├── detecta divergência entre fontes
       └── atualiza score_current e score_divergent no segmento
            │
            ├── score não cruzou limiar → fim
            │
            └── score cruzou limiar (30 / 55 / 80)
                      │
                      ▼
4. AlertEventsProcessor  (BullMQ worker)
   ├── busca alerta aberto para segmento + nível
   ├── não existe → cria novo alerta
   ├── já existe  → reutiliza (idempotente)
   └── cria OS com prioridade mapeada do nível
            │
            ▼
5. DispatchCronService  (cron */5 * * * *)
   └── DispatchService
       └── agrupa OSs abertas em rotas por equipe
            │
            ▼
6. Equipe executa
   ├── open → in_progress
   └── in_progress → completed
            │
            ▼
7. POST /api/v1/work-orders/:id/complete
   └── transação atômica:
       ├── work_order.status         = "completed"
       ├── work_order.completed_at   = now
       ├── road_segment.score_current  = 0
       ├── road_segment.score_divergent = false
       └── alert.closed_at           = now
```

---

## Cálculo de score por fonte

### IoT (peso 50%)

```
score = heightCm × 1,4   →   clamped [0, 100]
```

| heightCm | score |
| -------- | ----- |
| 0        | 0     |
| 20       | 28    |
| 45       | 63    |
| 72+      | 100   |

### Veículo (peso 35%)

```
score = valor_base × confidence   →   clamped [0, 100]

ok        → valor base 10
attention → valor base 50
urgent    → valor base 85
```

`confidence` aceita 0–1 ou 0–100. O sistema normaliza automaticamente para [0, 1].

### Satélite (peso 15%)

```
score = (ndvi − 0,2) × 200   →   clamped [0, 100]
```

NDVI vai de 0,2 (vegetação esparsa) a 0,7 (densa). Abaixo de 0,2 → score 0. Acima de 0,7 → score 100.

---

## Motor de fusão

O `FusionService` busca todas as leituras das **últimas 24 horas** agrupadas por fonte e calcula a média ponderada:

```
score_total = Σ (score_médio_da_fonte × peso_da_fonte) / Σ pesos_das_fontes_presentes
```

Apenas fontes com leituras no período participam. Se apenas IoT enviou leituras nas últimas 24h, ele recebe peso 100% efetivo.

Pesos configurados:

| Fonte    | Peso |
| -------- | ---- |
| IoT      | 0.50 |
| Veículo  | 0.35 |
| Satélite | 0.15 |

### Exemplo de fusão com as três fontes

| Fonte     | Score médio | Peso | Contribuição |
| --------- | ----------- | ---- | ------------ |
| IoT       | 63          | 0.50 | 31.5         |
| Veículo   | 78.2        | 0.35 | 27.4         |
| Satélite  | 50          | 0.15 | 7.5          |
| **Total** |             |      | **66.4**     |

---

## Detecção de divergência

Após calcular os scores médios de cada fonte, o sistema verifica:

```
se max(scores_por_fonte) − min(scores_por_fonte) > 40:
    score_divergent = true
```

`score_divergent = true` indica que fontes diferentes estão vendo a vegetação de formas muito distintas. O manager pode investigar o segmento e acionar inspeção manual antes do limiar ser cruzado.

---

## Limiares e alertas

Quando o `score_current` cruza um dos limiares:

| Score mínimo | Nível do alerta | Prioridade da OS |
| ------------ | --------------- | ---------------- |
| ≥ 30         | `attention`     | `normal`         |
| ≥ 55         | `urgent`        | `urgent`         |
| ≥ 80         | `critical`      | `critical`       |

O sistema é **idempotente**: se o score cruzar o mesmo limiar enquanto já existe um alerta aberto para aquele segmento e nível, o alerta existente é reutilizado. Nenhum duplicado é criado, mesmo em caso de retry do worker.

---

## Despacho

O `DispatchCronService` executa a cada 5 minutos. Só aciona o `DispatchService` se houver OSs abertas que necessitem replanejamento.

O `DispatchService` organiza as OSs abertas em rotas por equipe de campo:

1. **Matching de território** — cada OS é associada à equipe cujo território cobre o km do segmento (`kmStart ≤ kmEnd_segmento AND kmEnd ≥ kmStart_segmento`)
2. **Ordenação** — dentro de cada equipe, as OSs são ordenadas por: prioridade (`critical` → `urgent` → `attention`) depois por `createdAt` depois por `kmStart`
3. **Rota gerada** — lista ordenada de OSs para a equipe executar

### Exemplo de ordenação

| OS  | Nível     | createdAt | kmStart |
| --- | --------- | --------- | ------- |
| A   | critical  | 10:00     | 5       |
| B   | urgent    | 09:30     | 12      |
| C   | urgent    | 11:00     | 3       |
| D   | attention | 08:00     | 8       |

Rota resultante: A → B → C → D

---

## Idempotência nas filas

Qualquer step pode falhar e ser retentado pelo BullMQ sem efeitos colaterais.

- **SegmentEventsProcessor**: O score é recalculado com os dados atuais do banco. Retry não duplica leituras.
- **AlertEventsProcessor**: Busca alerta aberto antes de criar um novo. Retry não duplica alertas nem OSs.

Configuração de retry: `attempts: 5`, backoff exponencial a partir de 2 segundos.

---

## Conclusão da OS

A conclusão é a única operação que modifica três tabelas ao mesmo tempo. Usa transação Drizzle diretamente no use case para garantir atomicidade:

```typescript
await drizzle.db.transaction(async (tx) => {
  await tx
    .update(workOrders)
    .set({ status: "completed", completedAt: now })
    .where(eq(workOrders.id, id));

  await tx
    .update(roadSegments)
    .set({ scoreCurrent: 0, scoreDivergent: false })
    .where(eq(roadSegments.id, segmentId));

  await tx.update(alerts).set({ closedAt: now }).where(eq(alerts.id, alertId));
});
```

Se qualquer update falhar, toda a transação é revertida. O estado do banco permanece consistente.
