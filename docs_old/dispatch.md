---
id: dispatch
title: Dispatch
---

# 🚚 Dispatch (Planejamento)

## Conceito

O sistema organiza as ordens de serviço em rotas por equipe e por dia.

---

## Território

Cada equipe atende um trecho:

```txt
km_start → km_end
```

---

## Planejamento

O sistema:

- agrupa OS por equipe
- ordena por prioridade
- organiza por proximidade
- respeita capacidade diária

---

## Prioridade

```txt
critical > urgent > attention
↓
mais antigas primeiro
↓
menor KM primeiro
```

---

## Rotas

```txt
route:
- team
- date
- status
```

```txt
route_items:
- ordem das OS
```

---

## Controle do gestor

Pode:

- reordenar
- remover
- trocar equipe
- travar rota

```txt
locked → sistema não altera
```
