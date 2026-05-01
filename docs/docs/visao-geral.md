---
sidebar_position: 2
title: Visão Geral
---

# Visão Geral

O Motiva monitora continuamente a condição da vegetação em cada trecho da rodovia e aciona as equipes de campo quando necessário.

## Segmentos de rodovia

A rodovia é dividida em **segmentos** — trechos contínuos identificados por rodovia, km inicial e km final (ex: BR-101 km 0–1). Cada segmento armazena sua geometria no banco via PostGIS e mantém dois campos de estado:

| Campo             | Descrição                                                      |
| ----------------- | -------------------------------------------------------------- |
| `score_current`   | Score atual de vegetação, de 0 a 100                           |
| `score_divergent` | `true` quando sensores diferentes discordam significativamente |

## Fontes de dados

Três tipos de sensor alimentam o sistema com pesos distintos no cálculo do score:

| Fonte        | Como mede                                                                             | Peso na fusão |
| ------------ | ------------------------------------------------------------------------------------- | ------------- |
| **IoT**      | Sensor fixo na margem, mede altura da vegetação em cm                                 | 50%           |
| **Veículo**  | Câmera embarcada classifica vegetação (ok / atenção / urgente) com nível de confiança | 35%           |
| **Satélite** | Índice NDVI via imagens Sentinel-2                                                    | 15%           |

Os sensores se autenticam com **API Key** e enviam leituras via `POST /api/v1/readings` ou via MQTT.

## Score de vegetação

Cada leitura gera um score individual de 0 a 100:

| Fonte    | Fórmula                                                                 |
| -------- | ----------------------------------------------------------------------- |
| IoT      | `altura_cm × 1,4` (limitado a 100)                                      |
| Veículo  | ok → 10 / atenção → 50 / urgente → 85 × confiança                       |
| Satélite | `(ndvi − 0,2) × 200` — NDVI saudável vai de 0,2 (esparso) a 0,7 (denso) |

O **motor de fusão** combina as leituras das últimas 24h de cada fonte usando média ponderada pelos pesos acima. Se leituras de fontes diferentes divergirem em mais de 40 pontos, `score_divergent` é marcado como `true`.

## Alertas

Quando o score cruzar um dos limiares abaixo, um **alerta** é aberto automaticamente para aquele segmento e nível:

| Nível   | Score mínimo | Prioridade da OS gerada |
| ------- | ------------ | ----------------------- |
| Atenção | ≥ 30         | Normal                  |
| Urgente | ≥ 55         | Urgente                 |
| Crítico | ≥ 80         | Crítico                 |

O alerta permanece aberto até a ordem de serviço ser concluída. O sistema é **idempotente**: se um novo ciclo de leituras resultar no mesmo nível de alerta enquanto já existe um alerta aberto, o alerta existente é reutilizado — nenhum duplicado é criado.

## Ordens de Serviço (OS)

Cada alerta gera automaticamente uma OS com ciclo de vida:

```
open → in_progress → completed
```

Ao concluir a OS, três coisas acontecem **atomicamente** numa única transação:

1. Status da OS muda para `completed`
2. Score do segmento é zerado (`score_current = 0`)
3. Alerta é fechado (`closed_at = now`)

## Despacho

O módulo de despacho organiza as OSs abertas em rotas otimizadas por equipe de campo, respeitando territórios, prioridade e capacidade diária. Veja [Despacho](./dispatch) para detalhes completos.
