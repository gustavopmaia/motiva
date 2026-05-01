---
sidebar_position: 1
slug: /
title: Introdução
---

# Motiva

**Por que roçagem de rodovias ainda é feita no escuro?**

Concessionárias de rodovias são obrigadas por contrato a manter a vegetação nas margens dentro de limites seguros. Vegetação alta encobre placas, reduz visibilidade em curvas e aumenta o risco de incêndios. Cada centímetro a mais é um passivo de multa e de responsabilidade civil.

O processo hoje é manual, caro e reativo: inspetores percorrem os trechos, anotam onde a vegetação está alta e acionam uma equipe dias depois. Até a equipe chegar, o problema cresceu.

**O Motiva resolve isso.**

Sensores já existentes — satélites Sentinel-2, câmeras embarcadas em veículos de patrulha e sensores IoT fixados nas margens — geram dados continuamente. O Motiva funde esses dados em um score único por trecho, abre alertas automaticamente quando o score ultrapassa limiares e cria ordens de serviço para as equipes de campo.

Mais do que monitorar, o sistema decide e organiza: o módulo de despacho agrupa as ordens de serviço por equipe, ordena por prioridade e distância, e entrega uma rota pronta para execução.

## O que o Motiva entrega

- **Detecção contínua** — sem depender de inspeção manual ou calendário fixo
- **Resposta rápida** — do sensor ao acionamento da equipe em minutos, não dias
- **Rotas otimizadas** — as equipes recebem uma sequência de atendimento que minimiza deslocamento e maximiza cobertura diária
- **Rastreabilidade completa** — histórico de scores, alertas e intervenções por trecho

## Como navegar

| Seção                        | O que cobre                                |
| ---------------------------- | ------------------------------------------ |
| [Visão Geral](./visao-geral) | Segmentos, sensores, scores e alertas      |
| [Arquitetura](./arquitetura) | Componentes, filas e banco de dados        |
| [Fluxo de Dados](./fluxo)    | Do sensor à conclusão da OS, passo a passo |
| [Despacho](./dispatch)       | Como as rotas são geradas para as equipes  |
| [Backend](./backend)         | API, autenticação e detalhes técnicos      |
