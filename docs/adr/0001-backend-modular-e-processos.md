# ADR 0001 — limites modulares e processos do backend

Estado: implementado no código em 2026-09-14; rollout de produção separado.

O backend mantém NestJS, Drizzle, Postgres/PostGIS, BullMQ, MQTT e FastAPI no monorepo. A escolha é um monólito modular com processos dimensionáveis por carga. URLs, autenticação Bearer e respostas usadas pelo frontend permanecem compatíveis. A recuperação de senha permanece inalterada por decisão do usuário.

## Organização

`modules/monitoring`, `maintenance`, `planning`, `identity`, `teams`, `road-network` e `reporting` possuem os respectivos schemas. `database/schema.ts` é o ponto de composição. As pastas legadas conservam módulos Nest, controllers, DTOs, consumidores e fachadas para preservar os contratos e a injeção de dependências.

Políticas de risco, transições de OS e agrupamento de rotas estão no domínio. Ingestão, comandos de OS/rotas, despacho e administração de API keys usam casos de uso e portas específicas. Query services Drizzle cuidam das projeções de equipes, trechos, alertas e relatórios. A renderização PDF/CSV tem adaptador próprio. A unidade de trabalho é pequena; os adaptadores dos fluxos atômicos coordenam as tabelas envolvidas na mesma transação, sem um repository genérico ou barramento de comandos.

Os testes arquiteturais impõem independência de framework/SQL nos domínios e casos de uso, acesso entre módulos pelas APIs públicas e ausência de ciclos. Há uma exceção explícita para imports de schemas necessários às FKs. As fachadas/transportes legados fora de `modules` não são cobertos pela regra de imports entre módulos. Login, usuários e recuperação conservam sua implementação existente; a nova administração de API keys é aditiva.

## Processos

`BACKEND_ROLE=api|domain|images|mqtt` seleciona a composição. `all` serve ao desenvolvimento. API não registra consumidores, MQTT nem agendadores de negócio. Domínio/MQTT não importam autenticação ou storage. Todos expõem health e métricas HTTP; só API expõe controllers de negócio. API, domínio, imagens e classifier podem ter quantidades de réplicas diferentes.

O estado necessário à coordenação fica no Postgres, Redis e armazenamento S3 compartilhados. Flags locais impedem apenas polls sobrepostos no mesmo processo. Limites locais de pool, jobs e inferência são controles de capacidade, sem exclusividade de negócio.

## Eventos e recuperação

Mudança de negócio e outbox têm o mesmo commit. Publicadores usam `FOR UPDATE SKIP LOCKED`, lease de cinco minutos e número da tentativa para confirmar a publicação condicionalmente. O ID do evento é estável; o job BullMQ inclui também a tentativa. Eventos têm envelope versionado, entidade, versão, horário, correlação e causa. O contexto HTTP acompanha a outbox e os eventos produzidos por consumidores.

A linha da outbox registra também o recibo do **consumidor único** do evento. O consumidor bloqueia essa linha, aplica efeitos e marca conclusão no mesmo commit. Não há garantia de entrega única: há entrega repetível e efeitos idempotentes. Fan-out futuro exige uma tabela de recibos por consumidor antes de adicionar outro consumidor independente.

Após perda de jobs no Redis, eventos sem efeito concluído voltam a ser publicados ao vencer o lease. Vinte entregas sem conclusão suspendem republicação automática; o registro permanece para inspeção e replay auditado. Cada job admite cinco tentativas com backoff e jitter. Alertas e OS são criados/vinculados atomicamente. O consumidor da fila antiga permanece para drenagem na transição.

## Concorrência e autorização

Leitura, fusão e intervenção serializam pelo trecho. Comandos de OS bloqueiam equipe atual, trecho e OS, revalidando atribuição e vínculo do ator na transação. Upload e inferência ficam fora dos locks. A associação final da evidência, conclusão, intervenção, auditoria e solicitação de planejamento têm um único commit. Repetição da mesma evidência é idempotente; conteúdo diferente gera conflito.

Edição manual de rotas e despacho coordenam pelo lock da equipe e locks ordenados nas OS. O despacho lê um snapshot, calcula os lotes fora da transação e revalida equipe, candidatas, rotas e versão do pedido antes de aplicar. Alterações concorrentes invalidam o plano; o cálculo tem até três tentativas. Pedidos são versionados por equipe e alterações de configuração geram novos pedidos duráveis. Não há lock global de planejamento. A unicidade de OS em rota continua garantida no banco.

Rotas também autorizam no caso de uso. Leituras de campo consultam o vínculo atual no mesmo SQL de escopo. Alterações manuais registram ator e estados anterior/posterior. Remover uma OS concluída da rota preserva a equipe histórica. Deadlocks, falhas de serialização e lock timeout têm retry transacional limitado, sem repetir I/O externo.

## Risco e proveniência

A política `v1` preserva pesos e limiares. Cada avaliação registra versão, contribuintes e validade; eventos de transição preservam esse contexto. As últimas observações por fonte são buscadas por índice, com desempate por ID. Novas leituras possuem `observed_at`; para registros legados, `created_at` é interpretado como UTC. Nenhuma conversão destrutiva de timestamps históricos foi feita.

Uma intervenção encerra a elegibilidade das medições anteriores. Eventos de ciclos anteriores não reabrem a manutenção. A expiração é reavaliada por agendadores concorrentes com locks por trecho; ausência de leitura válida resulta em score nulo. Reduzir score não comprova execução de serviço nem conclui OS automaticamente. Mantém-se a unicidade atual por nível; mudar para uma única OS escalonável por ciclo exige decisão de produto.

## Storage e compatibilidade

`team_id` identifica a equipe da OS. A coluna de nome e o trigger de compatibilidade continuam durante a transição; o backfill interrompe em nomes sem correspondência ou ambíguos.

S3 é obrigatório para fotos de produção nas APIs/workers de imagens; disco permanece disponível em desenvolvimento. Uma intenção de upload com chave/hash/tamanho é persistida antes do PUT. O commit do negócio associa a intenção. A limpeza de intenções sem referência exige carência mínima de 24 horas e usa estado `deleting` para impedir associação concorrente. Excluir o objeto ocorre fora do lock e pode ser repetido após falha. Objetos legados sem intenção não são apagados pelo utilitário.

A migração para S3 copia arquivos referenciados, confere SHA-256 e preserva os originais. O primeiro rollout exige pausa/drenagem coordenada dos escritores antigos: compatibilidade de schema não torna seguro misturar protocolos antigos de concorrência com os novos.

## Limites medidos e operacionais

O benchmark local usa 1, 2 e 4 APIs com igual número de workers de domínio, incluindo cenário concentrado em um trecho. Os resultados e limites estão em `docs/benchmarks/README.md`. Não demonstra escala linear nem substitui medição na infraestrutura de produção.

PDF permanece síncrono e passa a transmitir bytes enquanto lê fotos sequencialmente. Linhas e páginas necessárias aos rodapés ainda ficam em memória; listas legadas continuam sem truncamento. Paginação aditiva, particionamento, processamento assíncrono de relatórios e pooler dependem de volume e medição reais. A política atual conserva histórico de leituras/auditorias e objetos associados; não existe exclusão automática desse histórico.
