# Pesquisa e decisões — 13/09/2026

## Modelos de operação

[Divulgador Inteligente](https://www.divulgadorinteligente.com/) apresenta automação de grupos, agendamento, segmentação e texto customizável. [Pai das Ofertas](https://paidasofertas.com/) apresenta busca automática, obtenção de foto/preço/título e publicação em vários grupos. Essas são capacidades anunciadas pelos próprios produtos, não auditoria de sua implementação ou resultados comerciais.

Aplicamos descoberta recorrente, filtros por público, voz editorial configurável, múltiplos destinos, revisão opcional, teto diário e histórico de decisões. A ideia de etapas conectadas foi informada pelos [workflows do n8n](https://docs.n8n.io/workflows/) e implementada na própria aplicação com [React Flow](https://reactflow.dev/learn). A execução é NestJS; não há uma instalação de n8n escondida nem dependência de Python. O editor executa caminhos sequenciais, não é um clone completo de n8n com código arbitrário e ramificações.

[Promobit: critérios de moderação](https://www.promobit.com.br/institucional/criterios-de-moderacao/) fundamenta a curadoria: informações verificáveis, revisão de condições e aprovação antes de publicar. [Pelando: grupos](https://www.pelando.com.br/grupos) demonstra a distribuição de ofertas em grupos. Aplicamos cadastro/revisão, múltiplos destinos e acompanhamento por publicação; não copiamos ofertas nem alegamos reproduzir a infraestrutura interna dessas empresas.

## Shopee e Mercado Livre

[Shopee: Open API oficial para afiliados](https://affiliate.shopee.com.br/open_api/document?type=overview). Existe um portal específico, mas a documentação redirecionou para login no teste de navegador. Sem as credenciais da conta não foi possível validar permissões ou uma busca autenticada. A Open Platform para vendedores não é a mesma API.

Foi implementado conector `productOfferV2` com assinatura SHA256 de App ID + timestamp + payload exato + Secret, conforme código publicado pelo autor do [SDK independente shopee-affiliate](https://github.com/gregojoao/shopee-affiliate), especialmente `ShopeeSignatureBuilder.cs` e `ShopeeAffiliateGraphQlPayloadFactory.cs`. É evidência primária da implementação desse SDK, não documentação oficial Shopee. Query de busca e compatibilidade de conta ainda exigem o teste autenticado no painel. O link usado é `offerLink` retornado pela API; não se inventa preço original a partir de percentuais ou parâmetros comissionados.

Também foi implementado feed JSON HTTPS autorizado para outras fontes. O fornecedor deve fornecer o link comissionado e dados atualizados. A aplicação não compra, licencia nem cria esse fornecedor automaticamente. Downloads restringem rede pública, fixam o IP DNS validado, revalidam redirecionamentos e limitam tamanho/tempo. Páginas públicas só enriquecem detalhes/foto; bloqueios preservam dados da fonte, sem contornar controles.

[Mercado Livre: gerador oficial](https://www.mercadolivre.com.br/l/afiliados-gere-seus-links) e [comece a recomendar](https://www.mercadolivre.com.br/l/comece-a-recomendar) confirmam geração pela central/barra de afiliados. Não foi localizada documentação pública de uma API equivalente. Isso não prova inexistência de integrações privadas. Não usamos endpoints privados, cookies da conta ou scraping.

## Telegram

[Bot API oficial](https://core.telegram.org/bots/api): sendPhoto permite multipart, legenda HTML e botão inline. getMe valida token, getChat/getChatMember validam destinos e getUpdates ajuda a localizar chats recentes. A descoberta verifica getWebhookInfo e preserva webhooks existentes.

DMs exigem início da conversa pelo destinatário. Canais precisam de permissão para postar. Rate limits 429 usam retry_after. A API não oferece idempotência para envio; timeouts e interrupções após aceitação são ambíguos e não devem gerar reenvio silencioso.

## Gemini

[Documentação oficial de geração](https://ai.google.dev/gemini-api/docs/text-generation). A chave fornecida listou modelos, mas gemini-2.5-flash retornou 404 informando indisponibilidade para novos usuários. A resposta do Google recomendou gemini-3.6-flash; esse modelo gerou texto com sucesso no painel. O modelo é configurável.

## Arquitetura e métricas

[NestJS](https://docs.nestjs.com/first-steps) concentra autenticação, validações, credenciais e fila persistente. Não foi necessário adicionar n8n/Python. Supabase mantém o estado; o worker deve estar sempre ligado e roda em instância única.

O redirecionamento preserva o link comissionado e atribui cliques por publicação/destino. Bots conhecidos e HEAD são tratados separadamente. Visitantes são estimados por cookie/HMAC, sem guardar IP bruto. Não inferimos vendas ou CTR sem dados de conversões/impressões.
