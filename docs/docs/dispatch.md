---
sidebar_position: 5
title: Despacho
---

# Sistema de Despacho

O módulo de despacho transforma uma lista de ordens de serviço abertas em rotas executáveis por equipe de campo.

## Territórios das equipes

Cada equipe cobre um conjunto de trechos da rodovia definido por `km_start → km_end`. Quando uma OS é aberta para um segmento, o sistema já sabe qual equipe é responsável por aquele trecho.

```
Equipe Norte   → BR-101 km 0 – km 50
Equipe Centro  → BR-101 km 50 – km 120
Equipe Sul     → BR-101 km 120 – km 200
```

## Geração de rotas

O `DispatchService` gera uma rota por equipe contendo os `route_items` (OSs) ordenados por três critérios em cascata:

1. **Prioridade** — Crítico > Urgente > Normal
2. **Antiguidade** — OSs mais antigas primeiro (dentro do mesmo nível de prioridade)
3. **Proximidade geográfica** — menor km primeiro, para minimizar deslocamento entre atendimentos

A capacidade diária da equipe é respeitada: OSs que ultrapassem a capacidade ficam pendentes e entram no próximo ciclo de despacho.

## Reagendamento automático

O `DispatchCronService` recalcula as rotas automaticamente sempre que o estado das OSs muda — nova OS criada, OS concluída ou OS reatribuída. As rotas refletem sempre a situação mais atual sem intervenção manual.

## Controle do manager

O manager tem visibilidade e controle total sobre as rotas antes de liberá-las:

- **Reordenar** itens dentro de uma rota
- **Remover** uma OS de uma rota (fica pendente para o próximo ciclo)
- **Reatribuir** uma OS para outra equipe
- **Aprovar** e liberar a rota para execução pela equipe

## Fluxo de execução

```
DispatchService calcula rotas
        │
        ▼
Manager revisa, ajusta se necessário e aprova
        │
        ▼
Equipe acessa sua rota e começa a execução
        │
        ▼
Equipe atualiza cada OS:
  open → in_progress → completed
        │
        ▼
Conclusão da OS:
  ├── score do segmento zerado
  ├── alerta fechado
  └── DispatchCronService recalcula rotas
```

## Estrutura de dados

```
teams
  └── team_segments      (km_start, km_end cobertos pela equipe)

routes
  └── route_items        (OSs na sequência de execução)
        └── work_orders  (OS com status e prioridade)
```

## Prioridade na prática

Para uma equipe com três OSs abertas:

| OS   | Nível   | Criada em | km    |
| ---- | ------- | --------- | ----- |
| OS-A | Urgente | há 2 dias | km 15 |
| OS-B | Crítico | há 1 dia  | km 8  |
| OS-C | Urgente | há 1 hora | km 22 |

Rota gerada: **OS-B → OS-A → OS-C**

- OS-B vem primeiro por ser crítico
- OS-A antes de OS-C por ser urgente e mais antiga
- OS-C por último, mesmo estando mais perto de OS-A, porque é mais recente
