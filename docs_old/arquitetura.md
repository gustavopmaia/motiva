---
id: arquitetura
title: Arquitetura
---

# 🧱 Arquitetura

O sistema é dividido em 3 camadas:

---

## 1. Campo

Fontes de dados:

- satélite
- veículo
- IoT

---

## 2. Processamento (Backend)

Responsável por:

- ingestão de dados (HTTP + MQTT)
- normalização
- cálculo de score
- criação de OS
- planejamento (dispatch)

---

## 3. Operação

- gestor: visão e controle
- equipe: execução
