# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Next.js App Router, TypeScript, NestJS para API e automação, Supabase Auth/Postgres, Gemini e Telegram Bot API. Tecnologias principais solicitadas pelo usuário.

## Users
Operadores de afiliados que encontram ofertas, revisam a copy e acompanham o resultado das publicações.

## Product Purpose
Centralizar a descoberta de produtos, preparação de promoções com IA e distribuição em canais como Telegram, com rastreamento de cliques.

## Positioning
Uma central operacional que conecta oferta, conteúdo e atribuição em um único fluxo antes da publicação.

## Operating Context
Aplicação operacional no navegador, com cadastro manual de ofertas, prévia, publicação em vários destinos Telegram e agendamento persistente. Supabase Afiliado configurado no plano gratuito em São Paulo. Credenciais de Telegram/Gemini fornecidas pelo usuário em ambiente local.

## Capabilities and Constraints
Login, catálogo manual, descoberta recorrente Shopee/feed, editor visual de fluxos sequenciais, filtros, enriquecimento público, Gemini com voz configurável, revisão opcional, publicação automática, destinos (canal/grupo/DM/tópico), limites e deduplicação, fila persistente, histórico e tracking. Dashboard personalizável com cor, densidade e blocos reordenáveis. Tracking exige domínio público; envio direto permite teste local. Shopee exige App ID/Secret de afiliado ainda não fornecidos; o conector não foi validado com um catálogo autenticado. Mercado Livre requer feed autorizado com links comissionados. O worker é de instância única e precisa permanecer ligado.

## Evidence on Hand
Números do painel vêm do banco. A conta e os produtos de QA são temporários e removidos após validação. Não há provas de vendas/comissões e essas métricas não são fabricadas. Referências oficiais e limites em docs/research.md.

## Product Principles
- Permitir teste sem envio e revisão; publicar automaticamente apenas quando o operador habilitar.
- Mostrar impacto com clareza.
- Rastrear cada link de forma atribuível.
- Começar simples e permitir automação progressiva.
