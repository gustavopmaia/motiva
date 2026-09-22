# Plano de evolução da arquitetura do backend

Plano aprovado em 2026-09-11. Atualização: 2026-09-14. Implementação do núcleo concluída localmente; validação e implantação em produção dependem da infraestrutura abaixo.

Decisão do usuário durante a implementação: recuperação de senha está fora do escopo e deve permanecer exatamente como está. Estão excluídos desta entrega os itens de entrega de e-mail, alteração de código, tokens e invalidação de sessão por troca de senha.

## Estado da entrega

| Frente                | Implementação e evidência                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulos e arquitetura | Schemas por domínio; casos de uso/portas de ingestão, manutenção, planejamento, rotas e API keys; query services; limites arquiteturais no CI. Fachadas/transportes legados preservados. |
| Concorrência e falhas | Outbox com recibo transacional por consumidor único, republicação após perda do Redis, replay auditado, idempotência de origem/captura/evidência e locks por trecho/equipe.              |
| Risco                 | Tempo de observação, ciclo de intervenção, versão/política/contribuintes, expiração e busca indexada das últimas fontes. Pesos e limiares preservados.                                   |
| Manutenção e rotas    | Ator explícito, autorização junto à escrita, evidência/conclusão atômicas, planejamento otimista fora de locks longos, pedidos duráveis e auditoria manual de rotas.                     |
| S3 e classifier       | Adaptadores compartilhados, uploads rastreados, migração com hash, limpeza de órfãos com carência, cliente validado/timeout, inferência limitada e smoke do modelo real.                 |
| Processos e operação  | API/domínio/imagens/MQTT independentes, throttling Redis dedicado, pools limitados, health por dependência, métricas e correlação.                                                       |
| Relatórios            | Consulta/renderização separadas; PDF síncrono com transmissão progressiva e leitura sequencial de fotos.                                                                                 |
| Validação             | Integrações reais com PostGIS/Redis/S3/Mosquitto, múltiplos processos, injeção de falhas, benchmark 1/2/4 réplicas e EXPLAIN ANALYZE reproduzíveis.                                      |

Detalhes finais de arquitetura: [ADR 0001](docs/adr/0001-backend-modular-e-processos.md). Execução, rollout e recuperação: [runbook](docs/BACKEND-OPERATIONS.md). Números e limites: [benchmarks](docs/benchmarks/README.md).

**Pendências externas:** provisionar S3 de produção e secrets, testar backup/restauração e migrations em cópia dos dados reais, definir carga esperada/SLO e executar rollout coordenado. Nenhum deploy ou acesso à VM de produção foi realizado. O usuário confirmou que o GitOps já está pronto. Seu repositório não foi alterado nem sua configuração inspecionada nesta tarefa; os requisitos de execução documentados aqui servem de referência para essa infraestrutura existente.

**Decisões condicionais:** não ativar exclusão de histórico sem política de retenção aprovada; não particionar tabelas, criar pooler ou exigir relatório assíncrono/paginação no frontend sem volume que justifique. Login/usuários/recuperação mantêm a implementação existente; administração de API keys foi acrescentada sem alterar esse fluxo. As decisões concretas do ADR refinam o desenho alvo abaixo.

## Objetivo e escopo

Evoluir o backend para suportar múltiplas réplicas com consistência, recuperação de falhas, limites claros entre módulos e manutenção previsível. Inclui NestJS, classifier Python, banco, filas, armazenamento, testes e configuração operacional relacionada. Não inclui alterações em apps/web.

Preservar URLs, autenticação Bearer, formatos de resposta, uploads e downloads usados pelo frontend. Novos campos e capacidades devem ser aditivos. Correções de autorização e integridade podem rejeitar operações anteriormente aceitas incorretamente; documentar essas mudanças e cobri-las por testes de contrato.

Manter monorepo, NestJS, Drizzle, Postgres/PostGIS, BullMQ e FastAPI. Adotar um monólito modular com arquitetura de portas e adaptadores nos limites relevantes e processos independentes. Não introduzir event sourcing, banco por módulo, barramento de comandos ou microsserviços por entidade nesta entrega.

## Evidências que motivam as mudanças

- `readings/fusion.service.ts`: atualização de score e publicação no Redis são operações separadas, sem serialização por trecho.
- `vehicle-captures/vehicle-captures.processor.ts`: reprocessar uma captura pode criar outra leitura; integração HTTP não tem timeout explícito nem validação de resposta em runtime.
- `work-order-photos/work-order-photos.service.ts`: metadados da foto são persistidos antes da transação que conclui a OS.
- `work-orders/work-orders.service.ts`: conclusão zera score, enquanto a fusão ainda pode usar medições anteriores à intervenção.
- `routes/routes.service.ts`: validações de atribuição ocorrem antes da transação; a restrição única já existente para OS em rota deve ser preservada.
- `work-orders/dispatch-cron.service.ts`: flag de replanejamento fica no Redis; lock tem TTL fixo e remoção sem verificação do proprietário.
- `work-orders/work-orders.controller.ts`: autorização por equipe depende de lógica no controller e comparação por nome.
- `database/schema.ts`: OS referencia equipe por texto, enquanto rotas usam ID; estados são textos sem todas as invariantes expressas no banco.
- `reports/reports.service.ts`: consulta, renderização e acesso a arquivos locais estão combinados.
- `auth/auth.service.ts`: recuperação de senha usa código fixo e o registra no log; validação e consumo do token não são uma operação indivisível.
- `app.module.ts` e módulos de funcionalidades: HTTP, workers, MQTT e cron são compostos juntos.

## Arquitetura interna alvo

### Módulos e propriedade dos dados

| Módulo       | Responsabilidade e dados sob sua responsabilidade                             |
| ------------ | ----------------------------------------------------------------------------- |
| Identity     | Usuários, credenciais, API keys, recuperação de senha, identidade autenticada |
| Teams        | Equipes, membros, capacidade e território                                     |
| Road network | Trechos, geometria e localização de uma coordenada                            |
| Monitoring   | Leituras, capturas, classificação, estado e histórico de risco                |
| Maintenance  | Alertas operacionais, OS, evidências e intervenções                           |
| Planning     | Rotas, atribuição e solicitações de replanejamento                            |
| Reporting    | Consultas de relatório, renderização, artefatos e histórico de geração        |

Alertas e OS ficam no mesmo limite de manutenção porque seu vínculo e suas transições exigem consistência conjunta. Fotos de evidência pertencem à manutenção; capturas veiculares pertencem ao monitoramento. Os endpoints existentes podem continuar separados.

Cada módulo expõe uma API interna pequena de comandos e consultas. Importações profundas de services, schemas e tipos de persistência de outros módulos ficam proibidas. Consultas de relatório podem fazer joins entre módulos por adaptadores de leitura dedicados, sem adquirir permissão para escrever nessas tabelas.

### Camadas e dependências

```text
apps/backend/src/
  bootstrap/                 # API, worker de domínio, imagens, MQTT
  modules/
    monitoring/
      domain/                # políticas, estados, invariantes, eventos
      application/           # casos de uso e portas necessárias
      infrastructure/        # Drizzle, classifier, storage
      transport/             # HTTP, MQTT, consumidores BullMQ, DTOs
      monitoring.module.ts
      public.ts
    maintenance/             # mesma organização, conforme necessário
    planning/
    identity/
    teams/
    road-network/
    reporting/
  workflows/                 # orquestrações transacionais entre módulos
  platform/                  # configuração, DB, mensageria, logs, métricas
  shared/                    # apenas primitivas realmente compartilhadas
```

- Domínio não importa NestJS, Drizzle, Redis ou HTTP. Políticas de risco, transições de OS, prioridade e agrupamento geográfico são funções/objetos testáveis com entradas explícitas.
- Aplicação recebe comandos tipados e contexto do ator, aplica autorização e coordena domínio, transação e portas externas.
- Controllers e consumidores validam o transporte, chamam casos de uso e mapeiam respostas/erros. Não concentram regras de negócio.
- Infraestrutura implementa portas específicas, como armazenamento, classifier, consulta espacial e persistência de agregados. Evitar repository genérico e interfaces que apenas reproduzam cada método do ORM.
- Leituras usam query services com projeções específicas; escritas usam casos de uso com invariantes. Ambos continuam no mesmo banco.
- DTO HTTP, payload de evento, modelo de domínio e linha Drizzle são contratos distintos. Compartilhar apenas quando a semântica for realmente igual.
- Dividir o schema por módulo, mantendo um ponto de composição para Drizzle e migrations.
- Enforce de dependências no lint/teste arquitetural: domínio independente, ausência de ciclos e acesso entre módulos apenas pelas APIs públicas.

### Transações entre módulos

Uma abstração pequena de unidade de trabalho permite que adaptadores de módulos diferentes participem da mesma transação Postgres sem expor SQL ao domínio. Workflows como concluir manutenção coordenam as APIs transacionais públicas dos módulos envolvidos.

Operações inseparáveis ficam na mesma transação: evidência + conclusão + intervenção + atualização do estado do trecho + auditoria + eventos pendentes. Alertas e OS correspondentes também devem ser criados/vinculados atomicamente quando pertencerem à mesma decisão operacional.

HTTP externo, inferência, armazenamento e cálculos demorados ficam fora de transações e locks. A gravação final revalida versão e estado antes do commit.

## Fluxos confiáveis e concorrência

### Outbox e processamento idempotente

1. Persistir mudança de negócio e evento na mesma transação.
2. Publicadores concorrentes reivindicam lotes com `FOR UPDATE SKIP LOCKED`, lease e identificação do proprietário; publicar fora da transação longa.
3. Marcar publicação condicionalmente ao proprietário. Se houver queda entre publicação e marcação, a republicação é esperada.
4. Consumidores usam recibo único por evento (a linha da outbox nesta entrega, com um consumidor por evento) na mesma transação dos efeitos. Não marcar como processado antes do commit.
5. Eventos possuem ID, tipo, versão de schema, entidade, versão da entidade, horário, correlação e causalidade.
6. Transições posteriores também gravam outbox; não deixar um segundo dual write escondido em consumidores.

Entrega pelo menos uma vez, com efeitos idempotentes. Identificador do job é auxiliar, não a garantia exclusiva. Distinguir deduplicação de entrega, deduplicação do comando de origem e restrições de negócio.

Manter eventos por uma janela de recuperação definida, rastrear conclusão nos consumidores relevantes e reconciliar trabalho pendente após perda de dados do Redis. Marcar um evento como publicado não é prova de conclusão. Replays históricos não devem recriar intervenções ou OS encerradas.

Definir retries com backoff e jitter, classificação de erros permanentes/transitórios, retenção, inspeção de falhas e comando administrativo auditado para reprocessar.

### Monitoramento e risco

- Serializar alteração por trecho; processar trechos diferentes em paralelo. Ingestão, fusão e conclusão de manutenção respeitam o mesmo protocolo.
- Introduzir `observedAt`, `receivedAt`, origem identificável e chave do evento de origem. Para dados legados, registrar explicitamente a aproximação de horários.
- Capturas usam ID estável e vínculo único com a leitura produzida. Repetir inferência não produz nova leitura.
- Manter versão do risco, versão da política, medições contribuintes, validade e última intervenção/ciclo de manutenção.
- Selecionar medições pelo tempo de observação e tratar atraso, empate e horário futuro com regras explícitas.
- Nova intervenção delimita as medições elegíveis; evento atrasado de ciclo encerrado não pode reabrir trabalho desse ciclo.
- Expiração de dados gera reavaliação durável e estado interno de dados desatualizados; não depender de chegar uma nova leitura.
- Preservar inicialmente pesos e limiares atuais. Extrair configuração validada/versionada antes de qualquer recalibração.
- Definir tabela de transições para redução/elevação de risco, ausência de dados, divergência e manutenção concluída. Por padrão, redução automática de score não equivale a comprovação de serviço realizado.
- Registrar ciclo operacional e definir unicidade nesse ciclo, preservando o comportamento atual por nível inicialmente. Migrar para uma OS por ciclo com escalonamento só após validar essa regra de produto; não fundir OS históricas silenciosamente.

### OS, evidências e autorização concorrente

- Formalizar transições permitidas de OS e rotas, incluindo efeitos sobre início, conclusão, alerta e replanejamento.
- Repetição do mesmo comando retorna resultado consistente; mesma chave de idempotência com conteúdo diferente gera conflito.
- Para clientes existentes, deduplicar por identidades naturais disponíveis, como captura e OS/evidência. Aceitar chave opcional para novos produtores sem exigir mudanças no frontend.
- Validar escopo do ator dentro do caso de uso e junto à gravação, evitando alteração de equipe entre autorização e atualização.
- Definir ordem global de aquisição de locks, timeout e retry limitado para deadlocks/conflitos.
- Registrar auditoria de ator, comando, alvo e transição. Eventos de integração não substituem histórico de auditoria.

### Planejamento

- Substituir flag Redis por solicitações duráveis/versionadas de replanejamento por equipe, produzidas na transação da mudança relevante.
- Calcular plano fora de locks longos; aplicar apenas após revalidar versão de equipe, OS e rotas. Em conflito, recalcular.
- Coordenar despacho, edição manual, início/conclusão e alteração de território/capacidade pelo mesmo protocolo.
- Preservar a restrição única de OS em rota e a posição única por rota já existentes.
- Solicitação recebida durante um planejamento permanece pendente para a próxima versão.
- Evitar lock global. Tratar transferências entre equipes com locks em ordem determinística e validação de atribuição.
- Cron apenas solicita trabalho idempotente; múltiplos agendadores não executam efeitos duplicados. Queda do agendador/worker não perde pedidos.

## Persistência e consultas

- Migrar `work_orders.team` para `team_id` com FK. Auditar nomes duplicados/sem correspondência antes do backfill; não escolher equipe arbitrariamente. Resposta legada continua expondo o nome via mapper.
- Preservar nome histórico da equipe em registros de auditoria/relatórios quando necessário.
- Adicionar checks para estados, faixas válidas de score/confiança, capacidade e intervalos; índices únicos para identidades de origem e efeitos idempotentes.
- Revisar timestamps para instantes em UTC com timezone; datas operacionais continuam datas no fuso definido. Verificar semântica histórica antes de converter colunas.
- Centralizar localização no `SegmentLocator`, com raio máximo configurado, tratamento de ambiguidade e resultado sem correspondência. Captura já localizada reutiliza o trecho definido.
- Validar índice espacial compatível com a expressão consultada, filtro de distância e plano de execução em dados representativos.
- Otimizar últimas leituras por trecho/origem/horário e consultas de despacho/relatórios com `EXPLAIN ANALYZE`.
- Acrescentar filtros e paginação optativos ou endpoints aditivos. Não truncar silenciosamente arrays que o frontend atual espera completos.
- Relatórios e listagens legadas continuam limitando a escala máxima desses endpoints; medir, documentar e otimizar sem mudar o contrato nesta entrega.
- Definir política de retenção para leituras, eventos, auditoria, fotos e relatórios. Particionamento de leituras fica condicionado a volume medido e benefício demonstrado.

## Armazenamento, classifier e relatórios

### Arquivos

- Porta de armazenamento com implementação S3 compatível para produção; disco local apenas em desenvolvimento.
- Chaves estáveis, hash, metadados, estado de upload e associação ao registro de negócio.
- Upload fora da transação; commit dos metadados e negócio em conjunto; rotina de limpeza de órfãos com carência e revalidação para não apagar uploads em andamento.
- Migração dos volumes atuais com manifesto, cópia, conferência de hash e leitura compatível durante a transição. Remover legado somente após validação e janela de rollback.
- Upload/download seguem pela API existente com autorização. Streaming e concorrência limitada evitam multiplicar buffers em memória.

### Classifier

- Isolar cliente HTTP com timeout, limites de concorrência, resposta validada e correlação.
- No Python, separar carregamento/lifecycle do modelo, pré-processamento, inferência e transporte.
- Executar inferência bloqueante fora do event loop, com concorrência limitada e dimensionamento da memória por réplica.
- Validar tamanho real e dimensões da imagem, parâmetros/limiares, saída numérica e classificações possíveis.
- Retornar versão do modelo e pré-processamento em campos aditivos e persistir essa proveniência.
- Validar a interpretação de probabilidade/confiança usando evidência do modelo; não presumir calibração nem mudar a regra automaticamente.
- Health/readiness específicos para modelo carregado; testes determinísticos de contrato e pré-processamento, além de smoke test do modelo real.

### Relatórios

- Separar consulta (`ReportQuery`), renderizadores PDF/CSV, acesso a evidências e registro de geração.
- Ler fotos pelo armazenamento compartilhado; usar streams/lotes e concorrência limitada.
- Preservar download síncrono atual. Não trocar resposta por `202` exigindo polling no frontend.
- Medir CPU/memória e isolar renderização em worker thread/processo se necessário, preservando resposta HTTP e timeout definido.
- Preparar geração assíncrona como contrato adicional somente se carga justificar, sem torná-la pré-requisito do cliente atual.

## Identidade, autorização e contratos

- Acrescentar administração de API keys em casos de uso. Preservar login, gestão de usuários e recuperação existentes nesta entrega.
- Guards autenticam/filtram papéis gerais; políticas de aplicação autorizam recurso, equipe e território para HTTP e demais entradas. Ator de sistema é explícito e restrito.
- Preservar formato Bearer e expiração existente. Rotação/revogação aditivas de API keys usam o banco compartilhado. Não alterar sessões por recuperação de senha nem exigir refresh no frontend.
- Manter API keys com hash como já ocorre; acrescentar revogação/rotação e impedir vazamento em DTOs e logs.
- Uniformizar DTOs de entrada, validação runtime, mapeamento de resposta e erro, evitando divergência entre Swagger e validação efetiva.
- Validar payloads de fila e classifier em runtime; versionar eventos para deploy com produtores/consumidores de versões diferentes.
- Testes de contrato garantem que entidades de persistência e campos sensíveis não escapam nas respostas.

## Execuções e escalabilidade horizontal

| Execução   | Composição                                                      | Sinal de capacidade                 |
| ---------- | --------------------------------------------------------------- | ----------------------------------- |
| API        | Controllers e casos de uso necessários, sem consumers/cron/MQTT | RPS, latência, CPU e saturação      |
| Domínio    | Fusão, manutenção, planejamento, publicador/reconciliação       | Idade e volume de trabalho pendente |
| Imagens    | Jobs de captura e integração com classifier                     | Espera, inferência e memória        |
| MQTT       | Consumidores compartilhados e persistência de entrada           | Taxa recebida, atraso e falhas      |
| Classifier | Inferência e modelo                                             | Concorrência, latência, CPU/memória |

- Criar composition roots independentes; mesma imagem Nest pode selecionar entrada por comando. Importar serviço de aplicação não inicia worker por efeito colateral.
- MQTT: verificar capacidades do broker, QoS, sessões, identidades de consumidores e confirmação após persistência. Testar quedas antes/depois da confirmação. Deduplicação exige chave estável do produtor; explicitar a garantia reduzida para mensagens legadas.
- Aplicar backpressure e limites de concorrência por workload. Filas de imagens não podem monopolizar processamento de manutenção.
- Extrair acesso Redis dedicado para throttling, eliminando dependência artificial do cliente de uma fila de domínio.
- Pools Postgres configuráveis; orçamento de conexões considera máximo de réplicas e margem operacional. Avaliar pooler apenas se necessário e compatível com o modo de transação adotado.
- Configuração tipada por execução, validada no startup. API não exige configuração exclusiva de inferência e vice-versa.
- Liveness verifica processo; readiness verifica dependências indispensáveis àquela execução, com timeout. Classifier fora do ar não torna automaticamente a API inteira indisponível.
- Shutdown deixa de aceitar trabalho, drena dentro de prazo e permite recuperação após término forçado.
- Redis compartilhado com persistência, política de memória adequada a filas e recuperação documentada; Postgres e armazenamento com backup e teste de restauração.
- Escala horizontal da aplicação não promete escala linear ilimitada: medir contenção por trecho/equipe e capacidade dos serviços compartilhados.

## Observabilidade e operação

- Correlação de ponta a ponta: request, evento, captura, leitura, trecho, alerta, OS e rota.
- Logs estruturados, redaction de credenciais e controle de cardinalidade; IDs individuais em logs/traces, não em labels de métricas.
- Métricas de idade da outbox, efeitos pendentes, filas, retries, falhas permanentes, dados vencidos, conflitos, pool, consultas, uploads e inferência.
- Alarmes por atraso e falha de fluxo de negócio, além de health HTTP.
- Runbooks para reprocessamento, reconciliação, indisponibilidade Redis/classifier, migração de fotos e rollback.
- Migrations em job exclusivo de release, com exclusão contra dois deploys simultâneos. Expandir schema, backfill, validar, migrar escritores/leitores e só depois remover estruturas antigas.
- Manifests do ambiente de produção ficam no repositório GitOps indicado pelo projeto: registrar mudanças necessárias; não presumir que esse repositório foi alterado ou que o deploy ocorreu.

## Plano de entrega

| Etapa / PR | Entrega                                                    | Dependências e aceite                                                        |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 0          | Baseline, contratos, ADRs, fixtures e mapa de dependências | Registrar endpoints atuais, invariantes e perfil de carga antes de refatorar |
| 1          | Políticas de autorização; recuperação excluída             | Ator explícito e testes de autorização/escopo concorrente                    |
| 2          | Estrutura modular, casos de uso e adapters                 | Migrar verticalmente um fluxo por vez; contratos preservados e limites no CI |
| 3          | Schema aditivo e modelo operacional                        | IDs de equipe, identidades, versões e ciclos; backfills auditáveis           |
| 4          | Unidade de trabalho, outbox/inbox e reconciliação          | Quedas em cada janela sem perda/duplicação de efeitos                        |
| 5          | Ingestão, geolocalização e fusão                           | Concorrência por trecho, atraso de eventos e medição fora de raio            |
| 6          | Armazenamento compartilhado e capturas                     | Migração de fotos, idempotência e inferência entre réplicas                  |
| 7          | Conclusão de manutenção e evidências                       | Transação completa, autorização e risco concorrentes                         |
| 8          | Planejamento e edição de rotas                             | Coordenação por equipe, versões e pedidos duráveis                           |
| 9          | Relatórios e classifier                                    | Adapters separados, runtime validado, memória/CPU medidas                    |
| 10         | Entradas independentes e operação                          | Configuração por papel, health, pools, shutdown, CI e runbooks               |
| 11         | Carga, falhas e rollout                                    | Demonstrar aumento de capacidade com invariantes preservadas                 |

ADRs devem registrar: limites dos módulos, protocolo transacional/locks, semântica dos eventos e recuperação, ciclo do risco, armazenamento e estratégia de compatibilidade. Etapas podem ser divididas em PRs menores; evitar uma mudança única de todo o backend.

## Validação e definição de pronto

- Unitários de políticas e transições, sem mocks do ORM reproduzindo a implementação.
- Integração real com Postgres/PostGIS, Redis e armazenamento compatível; classifier simulado nos cenários de falha e smoke test real separado.
- Testes HTTP de autorização, serialização e compatibilidade dos endpoints existentes.
- Dois ou mais processos reais disputando trabalho: não apenas duas chamadas no mesmo objeto de teste.
- Fault injection antes/depois de commit, publicação, confirmação MQTT, upload e consumo de evento.
- Corridas entre conclusão e leitura, replanejamento e edição, troca de equipe e autorização, duas conclusões.
- Migrations/backfills e rollback com dados preservados. No primeiro rollout, pausar/drenar escritores antigos; coexistência sem pausa requer uma versão intermediária futura.
- Benchmark com 1, 2 e 4 réplicas quando o ambiente permitir, distribuição entre trechos e cenário de trecho muito disputado.
- Registrar hardware, dataset, taxa sustentada, p95/p99, erro, espera em fila, tempo até OS e saturação das dependências. Fixar metas numéricas a partir do baseline e da carga esperada antes de avaliar aprovação; não inventar SLO sem evidência.
- CI obrigatório por workload: lint, tipos, arquitetura, unitários, integração, contrato e build; validação Python e teste concorrente crítico incluídos. Carga prolongada em execução específica.
- Encerrar quando o sistema preservar contratos, resistir aos cenários de falha, operar sem arquivos/locks de negócio exclusivos de réplica e mostrar ganho de capacidade para carga distribuída ao adicionar réplicas, com limites registrados.

## Dependências e decisões que precisam ser registradas na implementação

- Endpoint/bucket e credenciais de armazenamento; características do broker MQTT.
- Volume atual e esperado, hardware disponível e orçamento de conexões/memória para definir metas.
- Raio aceitável de localização, tolerância a atraso e validade de cada fonte. Tornar configuráveis e validar com fixtures antes de produção.
- Semântica aprovada de redução de risco, ciclo de manutenção e escalonamento de OS. Preservar regras atuais até documentar mudança intencional.
- Garantias para produtores legados sem identidade de evento e consumidores atuais sem paginação: explicitar esses limites sem exigir trabalho no frontend.

Essas dependências não bloqueiam a organização modular, os testes de contrato nem as correções locais. Configurar produção e mudar regras de negócio depende de valores reais e decisões registradas, não de suposições ocultas.
