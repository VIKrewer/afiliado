# afiliado.

Central de ofertas com **Next.js + TypeScript**, API/worker **NestJS**, **Supabase Auth/Postgres**, **Gemini** e **Telegram**. Editor visual de fluxos, descoberta recorrente, filtros, conteúdo editorial configurável, fila e tracking por destino.

## Executar

Node.js 22.13+ (testado com Node 26). As dependências já estão instaladas neste workspace.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Um comando inicia frontend (3000) e API (3001). Alterações no backend exigem reiniciar. Não execute duas instâncias da API sobre o mesmo banco.

O projeto Supabase **Afiliado** foi criado no plano gratuito, em São Paulo, e a migração foi aplicada. URL/chave pública e chave de criptografia ficam em `.env.local`; as chaves fornecidas pelo usuário ficam no `.env`. Ambos são ignorados pelo Git.

## Primeiro envio

1. Crie sua conta e confirme o e-mail se solicitado pelo Supabase.
2. Entre pelo localhost. A primeira conta autenticada localmente será vinculada às chaves do `.env`; outras contas configuram suas próprias credenciais.
3. Em **Integrações**, clique **Verificar bot salvo**. Foi validado `@afiliado_krewer_bot`. O Gemini padrão `gemini-3.6-flash` foi testado com a chave fornecida.
4. Adicione o bot ao grupo/canal, ou envie `/start` a ele para uma DM. Em **Destinos**, informe nome e chat ID. **Buscar conversas** localiza IDs recentes. Canais exigem administrador com permissão de postagem; tópicos aceitam ID adicional.
5. Em **Nova oferta**, cadastre link comissionado, nome, preço, cupom, condições e foto JPG/PNG/WebP até 5 MB. Gere ou escreva a descrição, revise a prévia e salve.
6. Selecione destinos. Sem domínio público, **desmarque Rastrear cliques**: a mensagem usará seu link direto de afiliado, sem tracking.
7. Clique **Publicar nos destinos selecionados**, ou escolha uma data futura. Essa ação aprova o conteúdo e autoriza os envios. Consulte **Publicações** para acompanhar cada destino.

Nenhuma mensagem real foi enviada durante os testes, pois não havia destino escolhido. O token foi validado com getMe e o envio texto/foto foi testado com respostas simuladas da Bot API.

## Tracking

Em **Integrações**, configure uma URL HTTPS pública que sirva esta aplicação e encaminhe `/r/*` ao NestJS. Os rewrites já estão implementados. Preencher um domínio que não aponta para a aplicação não é suficiente; localhost não funciona nos celulares dos participantes.

Cada publicação/destino recebe um link próprio. O redirecionamento 302 preserva os parâmetros do afiliado, desativa cache e registra acessos. Bots/prévias conhecidos são separados; HEAD não conta. Uma falha na gravação do clique não impede o redirecionamento.

Visitantes são estimados por cookie de 30 dias, armazenado como HMAC. Não armazenamos IP bruto. A filtragem por user-agent não identifica todos os bots. Cliques não representam vendas, comissão ou CTR. Totais consideram todo o histórico; o gráfico usa os últimos sete dias em UTC.

Links e snapshots antigos não mudam ao editar um produto ou domínio. Mantenha o domínio anterior ativo para preservar links já publicados.

## Automação

Em **Fontes de ofertas**, salve o App ID e Secret da Shopee Affiliate Open API, ou configure um feed HTTPS autorizado na etapa de busca. Depois:

1. Abra **Automações**. O modelo inclui busca → filtro → detalhes/foto → IA → publicação.
2. Selecione as etapas para configurar palavra-chave, desconto, preço máximo, termos bloqueados, estilo e destinos. Arraste os blocos e conecte os pontos: as conexões determinam a ordem executada. Apague uma conexão selecionando-a e pressionando Delete. Para ramificações, crie fluxos separados; o validador exige um caminho sequencial sem ciclos.
3. Defina intervalo (mínimo 15 minutos), ofertas por execução, teto diário, período sem repetição e janela horária/fuso.
4. **Testar sem enviar** faz busca e geração reais, mas nunca publica. Acompanhe **Execuções** e revise **Descobertas**; o texto pode ser editado antes da aprovação.
5. Escolha **Publicar automaticamente**, selecione os destinos e marque **Ativar fluxo ao salvar**. Salvar autoriza as execuções e os envios nesses destinos. O modo de revisão apenas prepara as descobertas.

O scheduler verifica fluxos a cada cinco segundos. A execução registra contagens e decisões por etapa; falhas da fonte não geram ofertas fictícias. Ofertas publicadas manualmente também entram no controle de repetição e limite diário. Aprovações com dados de mais de 24 horas exigem nova busca. A pausa global bloqueia novas execuções e envios, mas não cancela chamadas já iniciadas.

**Personalizar** define workspace, quatro cores, densidade, blocos/ordem do dashboard, público, instruções e exemplos editoriais. A IA gera uma chamada curta e uma descrição específica; preço, cupom e identificação de publicidade são adicionados pelo sistema. Conteúdo de páginas é tratado como dado não confiável; não se usa pesquisa generativa para inventar especificações ausentes.

O worker NestJS consulta a fila a cada dois segundos e deve ficar ligado. Cada destino tem um job persistente com snapshot aprovado, horário, tentativas, mensagem Telegram e status. Agendamentos vencidos retomam ao ligar o servidor.

- Solicitações repetidas com a mesma chave não duplicam jobs.
- Controle de versão evita reivindicações concorrentes do mesmo job.
- O erro 429 respeita retry_after, até cinco tentativas; outros erros ficam disponíveis para nova tentativa manual.
- Timeout, erro 5xx ou reinício durante envio ficam **Verificar no Telegram**. A Bot API não suporta idempotência; não se reenvia automaticamente uma resposta ambígua.
- A pausa global não interrompe requisições em andamento. Remover um destino cancela seus pendentes quando o worker os encontrar.
- Excluir uma oferta mantém o histórico e snapshots das publicações.

Não é necessário instalar n8n ou Python. Um n8n existente pode alimentar o contrato de feed, mas a aplicação executa o fluxo sem depender dele. Importação/exportação JSON do editor remove destinos e desativa o fluxo, sem exportar credenciais.

## Marketplaces

O cadastro manual aceita Shopee, Mercado Livre e outras lojas. Ele não transforma links comuns em comissionados.

A Shopee tem um [portal oficial de Open API](https://affiliate.shopee.com.br/open_api/document?type=overview). O conector assina consultas `productOfferV2` e consome o `offerLink` retornado. **A integração autenticada ainda depende do App ID/Secret e das permissões da sua conta**; sem essas chaves não foi possível validar o catálogo real. O contrato foi implementado a partir de evidência pública de um SDK independente, não de uma sessão autenticada do portal. O botão Testar conexão valida essa compatibilidade para sua conta.

No Mercado Livre foi confirmado o [gerador oficial](https://www.mercadolivre.com.br/l/afiliados-gere-seus-links); não foi localizada documentação pública de API equivalente para afiliados. Para descoberta recorrente dessa loja, conecte um fornecedor/feed autorizado que já forneça links comissionados. O aplicativo não inclui um catálogo próprio nem obtém comissões apenas por encontrar um produto na internet. [Pesquisa e referências](docs/research.md), [contrato de feeds e operação](docs/automation.md).

## Supabase e hospedagem

Para outra instalação, use `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` aceita chave secreta `sb_secret_…` ou service_role legada. Nunca a exponha com prefixo NEXT_PUBLIC_. A tabela `affiliate_records` tem RLS, sem acesso direto de anon/authenticated: o NestJS valida sessão e proprietário antes de acessar. O aviso informativo “RLS Enabled No Policy” é intencional; clientes não acessam essa tabela diretamente.

```bash
npm run build
npm start
```

Produção exige Supabase e uma chave `SETTINGS_ENCRYPTION_KEY` estável de 64 caracteres hex. A chave já gerada em `.env.local` precisa ser preservada nos backups: alterá-la impede ler as credenciais criptografadas. `.env.local` tem precedência sobre `.env`.

Mantenha **uma única API/worker continuamente ligada**, com HTTPS, em VPS ou serviço de containers. O worker não funciona como função serverless que dorme entre requisições. `API_INTERNAL_URL` define o destino dos rewrites se a API estiver em outra máquina; `API_HOST` define o bind do NestJS. Mantenha a API em rede privada.

`SUPABASE_ADMIN_USER_ID` pode vincular explicitamente as chaves de ambiente a uma conta. Se o vínculo foi feito pelo primeiro login local, ele também fica persistido no banco. Sem Supabase, apenas desenvolvimento aceita SQLite local em `.data/afiliado.sqlite`, restrito ao localhost. O banco local é separado e não migra automaticamente.

## Verificação e limites

```bash
npm test
npm run lint
npm run build
```

Testes cobrem isolamento, snapshots, deduplicação, agendamento, cancelamento, retry_after, resultado ambíguo, HTML, upload multipart e tracking. Login, persistência Supabase, geração Gemini e layout desktop/celular também foram verificados. Scripts qa-* são ferramentas de desenvolvimento, não necessárias ao uso.

A implementação atende uma operação pequena com um worker. Documentos versionados e imagens pequenas em base64 ficam em uma tabela; o dashboard consulta o histórico completo. Para grande volume, separar imagens em Storage, paginar telas, agregar cliques por SQL e usar fila distribuída com lease/heartbeat antes de adicionar workers. Não há integração de vendas/comissões, catálogo próprio, recuperação de senha personalizada ou hospedagem pública contratada. Preços variam; não há histórico de preços externo nem garantia de menor preço. Gemini pode consumir sua cota a cada execução.

## Arquivos

- `src/app`: login, dashboard e formulários Next.js.
- `server/main.ts`: NestJS, autenticação e redirecionamento.
- `server/service.ts`: produtos, destinos, Gemini, Telegram e fila.
- `server/store.ts`: persistência e controle de versão.
- `server/vault.ts`: criptografia AES-256-GCM e HMAC.
- `supabase/setup.sql`: estrutura já aplicada.
- `supabase/automation.sql`: migração incremental de fluxos e preferências, também aplicada.
- `server/automation.ts`: scheduler e executor do grafo.
- `server/sources.ts`: Shopee, feeds e enriquecimento público.
- `src/components/flow-studio.tsx`: editor visual, descobertas e execuções.
- `tests/workflow.test.cjs`: testes isolados, sem envios reais.
