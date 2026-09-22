# Operação e validação do backend

## Configuração e execuções

API, domínio, imagens e MQTT podem executar a mesma imagem, com `BACKEND_ROLE` diferente. Scripts locais: `start:api`, `start:domain`, `start:images`, `start:mqtt` no workspace `backend`. Todos usam `PORT` para health e métricas; ao rodar no mesmo host, atribua portas diferentes.

| Papel  | Configuração necessária                                     | Dimensionamento                              |
| ------ | ----------------------------------------------------------- | -------------------------------------------- |
| api    | DATABASE_URL, REDIS_URL, JWT_SECRET, storage S3 em produção | tráfego e latência HTTP                      |
| domain | DATABASE_URL, REDIS_URL                                     | idade da outbox e backlog de planejamento    |
| images | DATABASE_URL, REDIS_URL, S3, CLASSIFIER_URL                 | espera de imagens e capacidade de inferência |
| mqtt   | DATABASE_URL, REDIS_URL, MQTT_URL e credenciais do broker   | atraso e volume da ingestão                  |

`BACKEND_ROLE=all` mantém conveniência local. Em desenvolvimento, configure `NODE_ENV=development` e `STORAGE_DRIVER=local`; não copie a configuração S3 de produção sem configurar o bucket.

Produção com API/imagens exige `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION` e credenciais pelo provider padrão da AWS. `S3_ENDPOINT` e `S3_FORCE_PATH_STYLE=true` permitem um serviço S3 compatível. O projeto não provisiona armazenamento de produção automaticamente. O bucket é privado; as permissões precisam permitir GET/PUT/DELETE dos dois prefixos de fotos e `s3:ListBucket` para a probe `HeadBucket`. A readiness não testa escrita/exclusão; validar o fluxo de upload antes de liberar tráfego. Não tornar o bucket público para atender downloads: eles continuam passando pela API autorizada.

`DB_POOL_MAX` (padrão 10) é por processo. Orçamento mínimo: soma de réplicas máximas × pool de cada papel, mais migrations, observabilidade e reserva administrativa. `DB_CONNECT_TIMEOUT_SECONDS` limita conexão; consultas e locks têm limites próprios. `CLASSIFIER_TIMEOUT_MS` tem padrão de 30 segundos; `SEGMENT_MATCH_RADIUS_M`, 500 metros. Ajustar raio e tolerância temporal requer validação com dados reais.

`QUEUE_PREFIX` deve ser igual entre processos do mesmo ambiente e distinto entre ambientes que compartilham Redis. Use uma zona `TZ` consistente em todas as réplicas para as datas operacionais das rotas (exemplo: `America/Sao_Paulo`); a migration não converte timestamps históricos sem timezone.

MQTT usa assinatura compartilhada com QoS 1. Para sessão durável em produção, cada réplica precisa de `MQTT_CLIENT_ID` estável e distinto; em Kubernetes, uma identidade de StatefulSet é uma opção. O broker e os produtores também precisam suportar QoS/sessão persistente. O grupo `MQTT_SHARED_GROUP` deve ser comum às réplicas que dividem o trabalho. O cliente usa MQTT 5, sessão de 24 h e um pacote em voo por consumidor. PUBACK ocorre após persistência; falha transitória força reconexão com a mesma sessão. O broker deve persistir sessões/mensagens em disco para sobreviver ao próprio reinício. A fixture Mosquitto de teste usa `persistence false` e acesso anônimo somente no host local; não é configuração de produção. Mensagens inválidas são armazenadas em `ingestion_rejections` antes da confirmação. Mensagens sem `eventId` podem gerar leituras duplicadas após redelivery.

## Ambiente descartável de integração

```bash
docker compose -f docker-compose.test.yml up -d --wait

TEST_DATABASE_URL=postgresql://test:test@localhost:55432/motiva_test \
TEST_REDIS_URL=redis://localhost:56379 \
TEST_S3_ENDPOINT=http://localhost:59000 \
TEST_MQTT_URL=mqtt://localhost:51883 \
AWS_ACCESS_KEY_ID=motiva-test AWS_SECRET_ACCESS_KEY=motiva-test-secret \
npm run test:integration --workspace=backend

docker compose -f docker-compose.test.yml down
```

A suíte trunca tabelas do banco informado. Use exclusivamente um banco descartável. Filas Redis usam prefixo aleatório; testes S3 criam e removem um bucket próprio. O comando exige as quatro URLs para evitar resultado verde com integrações silenciosamente puladas. O CI sobe os mesmos tipos de dependência e executa a suíte completa.

A imagem MinIO é uma fixture de teste fixada em uma [release publicada pelo projeto](https://github.com/minio/minio/releases/tag/RELEASE.2025-04-22T22-12-26Z); não é indicação de versão para hospedar dados de produção.

Validações sem infraestrutura:

```bash
npm run check-types --workspace=backend
npm run lint --workspace=backend
npm test --workspace=backend -- --runInBand
npm run build --workspace=backend
python3 -m unittest discover -s apps/classifier -p 'test_*.py'
```

Validação local final: 157 testes unitários, 81 integrações, lint, tipos e build aprovados. Os testes Python locais cobrem política/contrato numérico. O smoke do modelo real foi executado na imagem Docker e cobre health, inferência concorrente, determinismo, formato, bytes inválidos e limite de tamanho. Para repetir:

```bash
docker build --platform linux/amd64 -f apps/classifier/Dockerfile -t motiva-classifier-local .
docker run --rm --platform linux/amd64 \
  -v "$PWD/apps/classifier/smoke_test.py:/app/smoke_test.py:ro" \
  motiva-classifier-local python smoke_test.py
```

Cada réplica do classifier carrega um modelo. `INFERENCE_CONCURRENCY` aceita 1–8 (padrão 1); Uvicorn usa um worker e limite de 16 conexões/tarefas concorrentes. Os jobs de imagens têm concorrência 2 por processo Nest. Dimensionar em conjunto; o smoke valida execução/contrato, não acurácia ou calibração do modelo.

Benchmark e planos SQL (não executar junto com integração, pois compartilham o banco descartável):

```bash
TEST_DATABASE_URL=postgresql://test:test@localhost:55432/motiva_test \
TEST_REDIS_URL=redis://localhost:56379 BENCH_CONFIRM_DISPOSABLE=1 \
npm run benchmark --workspace=backend

TEST_DATABASE_URL=postgresql://test:test@localhost:55432/motiva_test \
BENCH_CONFIRM_DISPOSABLE=1 node apps/backend/scripts/explain-queries.cjs

node apps/backend/scripts/benchmark-report.cjs
```

Os dois últimos scripts usam o build já produzido. Resultados e limitações estão em [benchmarks/README.md](benchmarks/README.md).

## Migration e rollout

1. Fazer backup e inventário do banco, imagens e volumes atuais. Executar a nova migration primeiro em uma cópia descartável dos dados.
2. Auditar OS com nome de equipe inexistente/ambíguo. A migration `0012_reliable_processing` interrompe o backfill nesses casos; não escolhe uma equipe arbitrariamente.
3. Revisar também as constraints de `0015`, os uploads rastreados de `0013`, os pedidos por configuração de `0014` e as auditorias/proveniência de `0016`–`0017`. Executar migrations em um job exclusivo da release. O comando adquire advisory lock de sessão; não colocá-lo no startup de cada réplica.
4. Provisionar S3 e copiar as fotos existentes. Manter os volumes originais e o manifesto verificado para rollback.
5. Na primeira transição, pausar temporariamente ingestão/mutações e drenar os consumidores antigos. Executar cópia incremental final das fotos. Escritores antigos de risco não seguem os novos locks/outbox; não presumir que um rollout misto é seguro para esses fluxos.
6. Iniciar domínio, imagens e MQTT novos, depois APIs. Verificar health, filas e métricas antes de liberar o tráfego de escrita. Preservar o consumidor legado de OS até a fila antiga drenar.
7. Medir capacidade com duas ou mais réplicas. Usar o GitOps existente para o rollout; os papéis, variáveis e probes desta seção descrevem os requisitos da nova versão.

Essa primeira migração oferece compatibilidade de schema e de contratos HTTP, mas ainda requer janela coordenada para troca dos escritores. Um rollout misto sem pausa exige uma versão intermediária que faça os escritores antigos participarem do protocolo de concorrência; isso exige outra release.

Rollback de código deve preservar a migration aditiva e os arquivos antigos. Depois de aceitar novas fotos apenas no S3, voltar ao código que lê disco exige copiar essas novas fotos para o armazenamento legado antes de reabrir o tráfego. Não reverter schema com novos eventos/leituras em uso.

## Copiar fotos legadas

Com DATABASE_URL, diretórios legados e configuração S3 exportados no ambiente:

```bash
npm run build --workspace=backend
npm run storage:migrate --workspace=backend
npm run storage:migrate --workspace=backend -- --apply > photo-migration.jsonl
```

Sem `--apply`, o utilitário apenas lista os arquivos referenciados no banco. Com `--apply`, copia em lotes e verifica bytes via SHA-256. Pode ser repetido e não exclui arquivos. Fazer uma passagem final com os uploads legados pausados, pois IDs UUID não representam ordem temporal de criação.

## Falhas e reprocessamento

`/api/v1/health/live` verifica processo. `/api/v1/health/ready` e o endpoint legado `/api/v1/health` verificam banco/Redis com timeout, S3 quando configurado, conexão/assinatura MQTT no respectivo processo e classifier nos workers de imagens. A API não consulta o classifier na readiness. Falha do classifier não derruba a readiness da API; verificar o health do classifier separadamente.

Métricas em `/api/v1/metrics` incluem HTTP/CPU/memória do processo, filas, eventos pendentes/exauridos e sua idade, equipes com planejamento pendente, risco vencido, uploads pendentes antigos, retries transacionais por código PostgreSQL e duração/sucesso/falha de storage e classifier. Não há IDs de entidades nos labels. Use métricas nativas do Postgres/Redis/S3 para conexões, disco, evictions e saturação; a aplicação não substitui esses exporters. Configurar alarmes no ambiente; este repositório não instalou alarmes no cluster.

Se Redis cair, eventos permanecem na outbox. Ao voltar, publicadores retomam trabalho elegível. Eventos já publicados mas sem efeito concluído são republicados após cinco minutos. Vinte entregas sem conclusão suspendem tentativas automáticas; não significam descarte do registro.

```bash
npm run outbox:replay --workspace=backend
npm run outbox:replay --workspace=backend -- EVENT_UUID
OPERATOR_ID=identificador-do-operador npm run outbox:replay --workspace=backend -- EVENT_UUID --apply
```

Sem ID, lista os cem eventos pendentes mais antigos. Com ID sem `--apply`, simula. A execução real só reabre eventos incompletos e grava auditoria. Investigar primeiro a fila/erro do consumidor, o classifier e a dependência externa; replay sem corrigir a causa apenas repete a falha.

## Limpeza de uploads sem associação

O utilitário atua apenas sobre intenções rastreadas antigas sem referência em captura/evidência. A carência padrão e mínima é de 24 horas, superior ao timeout de upload. Dry run é o padrão; o estado transacional impede que um upload marcado para exclusão seja associado depois.

```bash
npm run storage:cleanup --workspace=backend
OPERATOR_ID=identificador-do-operador UPLOAD_CLEANUP_GRACE_HOURS=24 \
  npm run storage:cleanup --workspace=backend -- --apply > upload-cleanup.jsonl
```

Processa até 100 candidatos por chamada. Após revisar o dry run, pode ser executado por um job operacional agendado no GitOps; este repositório não instalou esse agendamento. Guarde a saída JSONL no registro operacional. Uma falha ao excluir mantém o candidato em `deleting` para retry. Objetos associados e arquivos legados sem intenção não são candidatos.

A política desta entrega conserva leituras, eventos concluídos, auditorias, relatórios e fotos associadas. Retenção de histórico e exclusão por idade precisam de prazo de negócio aprovado e política de backup/restauração. Não ativar lifecycle de expiração geral no bucket: isso quebraria evidências referenciadas no banco.

## Administração de API keys

Novos endpoints sob `/api/v1/auth/api-keys`, com JWT de gestor:

- `GET /`: últimas 100 chaves, somente metadados.
- `POST /:id/rotate`: substitui o segredo e retorna o novo uma única vez; a identidade do produtor é mantida.
- `DELETE /:id`: revoga de forma idempotente.

Rotação/revogação são auditadas. Requisições já autorizadas podem terminar; as próximas verificações consultam o estado compartilhado no banco. Recuperação de senha, login, sessões e frontend permanecem como estavam.

## Correções aditivas de integridade

Leituras e capturas aceitam atraso e até cinco minutos de relógio adiantado; datas além disso são rejeitadas. Na fusão, medições legadas muito futuras são ignoradas. `eventId` aceita 1–128 letras, números, hífen ou sublinhado; ele é opcional para produtores existentes.

Gestores devem remover a OS da rota antes de atribuí-la a outra equipe pelo endpoint de OS. Isso impede que a rota indique uma equipe enquanto a OS indique outra. Nomes de equipe inexistentes/ambíguos são erros de validação. Alterações de atribuição solicitam novo planejamento das equipes afetadas e preservam auditoria.

## Alarmes e resposta operacional

Antes do rollout, estabelecer limiares a partir da carga esperada. Investigar crescimento contínuo de `outbox_oldest_pending_seconds`, qualquer evento exaurido, filas com falhas, risco vencido ou pedidos de despacho que não drenam. Métricas de estado compartilhado aparecem em cada réplica; usar `max` para esses gauges, não somar réplicas como se fossem eventos diferentes.

Redis de filas precisa de persistência e política de memória sem eviction de jobs. A outbox recupera intenção durável, mas não elimina custo/atraso da perda do Redis. Na parada, permitir término de transações/jobs; em término forçado, leases e idempotência permitem retomada. No MQTT, identidade estável, QoS 1 do produtor e persistência do broker são parte da garantia; produtor sem `eventId` admite duplicação de leituras.

## Pendências de produção

O usuário confirmou que o GitOps já está pronto. Esta tarefa não alterou nem inspecionou o repositório GitOps ou a configuração do cluster; não há uma pendência de criação de GitOps nesta entrega.

- Provisionar endpoint/bucket/credenciais S3; dimensionar Postgres, Redis, broker e classifier, com isolamento de recursos e backups.
- Rodar migrations e a cópia de fotos primeiro em dados restaurados; demonstrar restauração antes de executar o rollout coordenado.
- Executar carga prolongada com distribuição, número de equipes, tamanho das fotos e relatórios reais. Fixar SLO a partir dessa necessidade. Os experimentos locais não definem os limites de produção.
