# Challenge FIAP - Motiva

Monorepo com backend e web/webview do challenge da Motiva.

Monitoramento de vegetação em rodovias: leituras de sensores IoT, inspeção veicular e
índice de satélite são fundidas em um score por trecho, que abre alertas e gera ordens
de serviço distribuídas automaticamente entre as equipes de campo.

## Como rodar

Pré-requisitos: Node `24.14.0` (ver `.nvmrc`) e Docker.

```bash
npm install
cp apps/backend/.env.example apps/backend/.env   # preencha os valores
docker compose up -d postgres redis
npm run migrate --workspace=backend
npm run dev
```

No `.env` local, use `NODE_ENV=development` — o valor de `production` do exemplo é o de deploy.

### Dados de demonstração

Popula o banco com equipes, leituras das três fontes, alertas, OSs e as rotas que o
despacho monta a partir delas. Trabalha em cima dos trechos já importados — pega a
rodovia com mais trechos e usa os que existem, então a demo roda sobre a geometria real.
Só cria uma rodovia de exemplo se o banco não tiver trecho nenhum.
Idempotente: rodar de novo não duplica nada.

```bash
npm run build --workspace=backend   # o seed roda a partir de dist/
npm run seed --workspace=backend
```

Cria só o usuário de campo `campo@motiva.com`, senha `motiva123` (ou `SEED_PASSWORD`) —
para entrar como gestor use a conta de manager que já existe no ambiente.

Cada registro é resolvido pela chave natural (nome da equipe, faixa de km do trecho,
e-mail do usuário), então rodar sobre um banco que já tem dados reúsa o que existe em vez
de duplicar. Com `NODE_ENV=production` exige `SEED_FORCE=1` e `SEED_PASSWORD`.

## Apps

- `apps/backend` — API REST (NestJS + Drizzle + BullMQ + MQTT)
- `apps/web` — Dashboard web + PWA (Vite + React)

A PWA instala na tela inicial e abre sem rede: o shell vem do precache e as respostas de
leitura (rotas, OS, trechos, alertas) ficam em cache por 24h, junto com os tiles do mapa
já visitados. Concluir OS e mudar status ainda exigem conexão. O cache de leitura é
apagado no logout para não expor dados de uma equipe à próxima que entrar no aparelho.

- `apps/classifier` — API de inferência (FastAPI + TensorFlow CPU), classifica foto de vegetação
- `docs` — documentação técnica (Docusaurus)

## Backend

```bash
npm run lint --workspace=backend
npm run check-types --workspace=backend
npm test --workspace=backend                 # unitários, sem banco
npm run test:integration --workspace=backend # exige TEST_DATABASE_URL
```

Os testes de integração rodam contra um Postgres com PostGIS e cobrem o SQL cru:
match geográfico de trecho, fusão de leituras, escopo por território e replanejamento
de rotas. Sem `TEST_DATABASE_URL` eles se auto-pulam.

```bash
docker run -d --name motiva-test-db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=motiva_test -p 55432:5432 postgis/postgis:17-3.5

TEST_DATABASE_URL=postgresql://test:test@localhost:55432/motiva_test \
  npm run test:integration --workspace=backend
```

Documentação da API em `/api/docs` com o serviço no ar.

## CI — build e push de imagem

O GitHub Actions **so constroi e publica imagem**. Nao faz SSH, nao roda
`kubectl`, nao toca no servidor. Quem faz deploy e o Argo CD, a partir do
repositorio [`nyxdev-gitops`](https://github.com/gustavopmaia/nyxdev-gitops).

| workflow                              | dispara quando muda                                             | imagem                                   |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `.github/workflows/ci-backend.yml`    | `apps/backend/**`, `packages/**`, `package*.json`, `Dockerfile` | `ghcr.io/gustavopmaia/motiva/backend`    |
| `.github/workflows/ci-classifier.yml` | `apps/classifier/**`                                            | `ghcr.io/gustavopmaia/motiva/classifier` |

Sao dois workflows, e nao um com dois jobs, porque no GitHub Actions o filtro
de path (`on.push.paths`) e por **workflow**. Mexer no FastAPI nao rebuilda o
NestJS e vice-versa — que e o ponto de ter um monorepo em vez de um repo unico.

### Tags

Cada push em `main` publica **uma** tag: o SHA completo do commit
(`ghcr.io/.../backend:<sha>`). Nao existe `:latest` em producao — uma tag movel
torna impossivel saber qual codigo esta rodando, e o Argo CD nao teria como
detectar mudanca. A escolha da versao acontece no Git, pelo Image Updater.

A tag `:cache` que aparece no GHCR e o cache de camadas do Buildx
(`cache-from`/`cache-to` com `type=registry`), nao uma imagem publicavel. O
Image Updater a ignora via `allow-tags: regexp:^[0-9a-f]{40}$`.

### Fluxo completo

```
push em main
   |
   v
GitHub Actions (CI)  -->  ghcr.io/.../<app>:<sha>
                                   |
                                   |  polling (~2min)
                                   v
                      Argo CD Image Updater
                                   |
                                   |  commit no nyxdev-gitops
                                   v
                      Argo CD sync  -->  cluster k3s
```

### Imagem do classifier

O FastAPI carrega um modelo `.keras` com TensorFlow. Decisoes tomadas:

- **`tensorflow-cpu`, nao `tensorflow`.** Ja era assim no `requirements.txt` e
  esta certo: o cluster nao tem GPU. A imagem final fica em **393 MB**, nao nos
  2-3 GB do pacote completo com CUDA.
- **O modelo entra na imagem.** Sao 9.2 MB, ja versionados no repositorio.
  Volume ou download no start so fariam sentido para modelo grande ou com ciclo
  de vida proprio; aqui o custo seria um PVC a mais, um passo de bootstrap a
  mais e uma imagem que deixa de ser autocontida.
- **Camadas por frequencia de mudanca:** `requirements.txt` (raro, ~250 MB de
  TensorFlow) -> modelo (raro) -> `main.py` (frequente). Commit no codigo
  reaproveita a camada pesada do cache.
- **Build em dois estagios:** o `venv` sai pronto do builder, e a imagem final
  nao carrega pip cache nem toolchain.

Para construir localmente num Mac Apple Silicon e preciso forcar a plataforma —
`tensorflow-cpu` nao tem wheel para `linux/arm64`:

```bash
docker build --platform linux/amd64 -f apps/classifier/Dockerfile -t motiva-classifier .
docker run --rm -p 8000:8000 motiva-classifier
curl localhost:8000/health
```

## Extensões

- [EditorConfig for VS Code](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
- [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
