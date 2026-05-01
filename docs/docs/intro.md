---
sidebar_position: 1
slug: /
title: Introdução
---

# Cultiva

Concessionárias de rodovias têm obrigação contratual de manter a vegetação nas margens dentro de limites seguros. Vegetação alta encobre placas, fecha a visibilidade em curvas e aumenta o risco de incêndios. Cada centímetro a mais é um passivo de multa e de responsabilidade civil.

O processo hoje é manual e reativo: inspetores percorrem os trechos, anotam onde a vegetação está alta e acionam uma equipe dias depois. Até a equipe chegar, o problema cresceu.

## O que o Roçadinha faz

O sistema funde leituras de três fontes — sensores IoT fixos nas margens, câmeras embarcadas em veículos de patrulha e imagens de satélite Sentinel-2 — em um score único por trecho de rodovia. Quando o score cruza um limiar, o sistema abre um alerta e cria uma ordem de serviço automaticamente. O módulo de despacho agrupa as ordens abertas em rotas otimizadas por equipe de campo.

Do sensor ao acionamento da equipe: minutos, não dias.

## Por que essa arquitetura

**Três fontes com pesos diferentes.** IoT é o mais confiável para medir altura com precisão (peso 50%). Câmera embarcada captura contexto visual com boa cobertura (35%). Satélite tem baixa frequência de atualização e depende de cobertura de nuvens (15%). A fusão ponderada evita que uma fonte ruidosa contamine o score inteiro.

**Processamento assíncrono com filas.** Leituras chegam em volume e precisam acionar alertas e ordens de serviço sem bloquear o endpoint de ingestão. Dois workers BullMQ processam os eventos em background com retry automático e idempotência garantida.

**Transação atômica na conclusão.** Quando uma equipe conclui uma ordem de serviço, três coisas precisam acontecer juntas: a OS fecha, o score do segmento zera e o alerta fecha. Qualquer falha parcial deixaria o sistema num estado inconsistente. A conclusão acontece numa única transação de banco.

## Navegação

| Seção                           | Conteúdo                                          |
| ------------------------------- | ------------------------------------------------- |
| [Arquitetura](./arquitetura)    | Componentes, filas, banco de dados e autenticação |
| [Backend](./backend)            | Como rodar, variáveis de ambiente e endpoints     |
| [IoT & Dispositivos](./iot)     | Hardware, firmware e protocolo MQTT               |
| [Pipeline de Dados](./pipeline) | Ingestão, fusão, alertas e ordens de serviço      |
