# Experimentos locais do backend

Execução em 2026-09-14. Estes resultados são amostras curtas e sintéticas, não um SLO de produção. O código dos experimentos fica em `apps/backend/scripts` e os comandos no runbook.

## Ingestão e geração de OS

Host: macOS arm64, Apple M5, 10 CPUs lógicas, 16 GiB; Node 24.14.0. PostGIS 17/3.5 e Redis 7 em Docker no mesmo host. Cada cenário usa 2.400 requisições, concorrência 32, aquecimento de 32 requisições por API e pool 5 por processo. APIs e workers de domínio são processos reais; o gerador de carga também compartilha o host.

| Distribuição | APIs + workers | req/s  | p95 (ms) | p99 (ms) | Até todas as OS (s) |
| ------------ | -------------- | ------ | -------- | -------- | ------------------- |
| 64 trechos   | 1 + 1          | 489.39 | 103.11   | 116.45   | 7.70                |
| 64 trechos   | 2 + 2          | 765.01 | 78.28    | 126.95   | 3.55                |
| 64 trechos   | 4 + 4          | 579.30 | 124.79   | 172.10   | 4.16                |
| 1 trecho     | 1 + 1          | 275.62 | 167.06   | 230.33   | 8.71                |
| 1 trecho     | 2 + 2          | 286.87 | 180.27   | 245.49   | 8.37                |
| 1 trecho     | 4 + 4          | 233.56 | 322.27   | 407.25   | 10.28               |

Todos os cenários retornaram 2.400 respostas HTTP 201, persistiram 2.400 leituras e produziram exatamente uma OS por trecho (64 ou 1), sem duplicatas. Nesta execução, duas APIs/workers tiveram a maior vazão distribuída (765 req/s), frente a 489 com uma e 579 com quatro. Houve variação relevante entre execuções: a rodada intermediária registrou 649/766/769 req/s. Não é válido transformar uma rodada curta em ganho percentual garantido; quatro réplicas não demonstraram benefício consistente neste host. No trecho único, a serialização preserva consistência e adicionar réplicas não aumenta vazão.

“Até todas as OS” é o tempo do início da carga até a contagem final, não a latência por evento nem um percentil da fila. O primeiro cenário também absorve custos iniciais das dependências/consumidores; não atribuir toda a diferença entre 7,70 s e 3,55 s exclusivamente à escala. Não foram medidos saturação independente do Postgres/Redis, carga prolongada, balanceador de produção, planejamento por equipes ou inferência neste experimento.

[Resultado completo](backend-local.json), [amostra anterior à otimização da consulta](backend-before-query-optimization.json) e [primeira amostra sem aquecimento](backend-cold-start.json). A amostra anterior aquecida registrou 612/733/705 req/s com 1/2/4 réplicas; a nova inclui otimização e outras mudanças, em execuções únicas. Não é comparação estatística isolada da consulta.

## Consultas reais

[EXPLAIN ANALYZE com buffers](query-plans.json), executado nas consultas usadas pelo código, com 10 mil trechos e 10 mil leituras num mesmo trecho. As fixtures são revertidas por rollback.

- Localização: `road_segments_geography_idx`, um candidato retornado. A consulta inclui `ST_DWithin` com raio e ordenação por distância/ID. Tempo desta primeira execução na conexão: 44,325 ms; não isola custos de inicialização/cache.
- Fusão: `readings_latest_observation_idx`, uma linha por busca em três loops. Tempo: 0,301 ms. O `LATERAL ... LIMIT 1` evita percorrer todo o histórico recente apenas para escolher a última leitura de cada fonte.

Os planos validam os índices nesta distribuição sintética. Rodovias densas, geometrias maiores, dados reais e cache frio/quente precisam de nova medição.

## Relatórios

[Amostra do renderizador](report-local.json): 1.000 linhas/fotos, 1,010,713 bytes de PDF, 0.116 s de parede, 0.144 s de CPU e máximo RSS do processo de 140.3 MiB. O primeiro chunk saiu após carregar 1 foto; atraso p99 do event loop, 19.07 ms.

É uma fixture JPEG de 1 pixel com adaptador de memória assíncrono, sem SQL/rede/S3/clientes lentos ou concorrência de relatórios. O RSS inclui runtime e dependências; não representa consumo incremental por relatório. A suíte também testa saída lenta e integridade do PDF. Linhas e páginas para rodapés continuam em memória; medir fotos reais e relatórios simultâneos antes de definir limites. Essa amostra não justifica, sozinha, mover renderização para outro processo.

## Classifier

[Smoke HTTP](classifier-smoke.json) executado na imagem Linux amd64 com o modelo real `sha256:b8e0c3ef977c1b8c1e6635ce556d66021bad61f6632fe6b1e7e52c0bed60a357`: readiness, duas inferências concorrentes, determinismo, formato/bytes inválidos e limite de upload. Três testes Python cobrem a política numérica. O teste comprova execução e contrato, não qualidade preditiva, calibração ou capacidade sustentada em produção.

## Verificações da entrega

157 testes unitários em 28 suítes, 81 testes de integração em 15 suítes, lint, TypeScript, build Nest e três testes Python passaram. O smoke do modelo real também passou. `apps/web`, `AuthService` e `AuthController` não têm alterações no diff; login e recuperação existentes foram preservados. Não foi feito deploy em produção.
