# Fontes, fluxos e operação

## Contrato do feed

GET em uma URL HTTPS pública, porta 443, resposta JSON até 2 MB. Se configurar token, o Nest envia `Authorization: Bearer …` apenas ao endpoint informado e não segue redirecionamentos. Use um endpoint confiável. Sem token, até três redirecionamentos públicos são aceitos. Não são aceitos localhost, IPs privados/reservados ou conteúdo acima dos limites.

```json
{
  "products": [
    {
      "id": "produto-123",
      "title": "Teclado mecânico ABNT2 RGB",
      "store": "Mercado Livre",
      "url": "https://sua-loja.example.com/produto-123",
      "affiliateUrl": "https://sua-loja.example.com/seu-link-comissionado",
      "price": 149.9,
      "oldPrice": 199.9,
      "imageUrl": "https://sua-loja.example.com/foto.jpg",
      "description": "USB, layout ABNT2 e iluminação RGB.",
      "coupon": ""
    }
  ]
}
```

O exemplo é estrutural, não uma oferta utilizável. Campos obrigatórios: id estável, title, url, affiliateUrl e price. Lojas aceitas: Shopee, Mercado Livre, Outra. Descrição até 1.600 caracteres, imagem JPG/PNG/WebP até 5 MB. Nunca informe preço antigo ou cupom sem confirmação. Preço/estoque devem vir atualizados da fonte. Até 500 entradas no JSON, no máximo 50 consideradas após busca por texto; use feeds segmentados. Título e descrição participam da pesquisa, com correspondência textual simples.

Um n8n seu pode consultar fontes autorizadas, mapear campos e expor esse contrato em um webhook GET. Credenciais da loja permanecem no seu servidor. Não é necessário n8n para o conector Shopee.

## Execução e controles

- Uma fonte e uma saída, com até 12 etapas. Os fios definem um caminho sequencial; ciclos, ramificações e etapas desconectadas são recusados. Use fluxos independentes para outros segmentos.
- O desconto vem da fonte. Em feeds, é calculado apenas se há preço antigo informado maior que o atual. Não existe promessa de menor preço histórico.
- IA usa os fatos recebidos e a descrição pública quando acessível. Nunca recebe as credenciais. Há instrução de não obedecer comandos em descrições; ainda assim, conteúdo gerado pode errar e deve ser acompanhado.
- O teste consome consultas/cota Gemini e pode criar descobertas, mas não jobs Telegram, mesmo se o fluxo estiver em modo automático.
- Intervalo 15 min a 7 dias; até 10 ofertas por execução e 100 por dia por fluxo. Horas iguais significam 24 horas. Janelas podem atravessar meia-noite.
- Teto diário conta ofertas enfileiradas, não destinos nem confirmação de entrega. Cancelamentos/falhas não devolvem a cota automaticamente. Deduplicação é por produto/fonte/fluxo, não global entre fluxos: evite segmentos sobrepostos nos mesmos destinos.
- Histórico de publicações não é apagado ao editar catálogo ou remover fluxo. Ofertas em revisão com mais de 24h exigem atualizar a fonte.
- Ao reiniciar, execuções interrompidas são sinalizadas e a próxima busca respeita `nextRun`. Jobs Telegram de resposta ambígua exigem conferência humana, pois a Bot API não fornece idempotência de envio.
- Uma única instância do worker é obrigatória. Não escale réplicas antes de implementar leases distribuídos e recuperação com heartbeat.

## Instalação e atualização

Instalação nova: aplique `supabase/setup.sql` e depois `supabase/automation.sql`. As duas já foram aplicadas no projeto Afiliado. Use Node 22.13+, `npm ci`, `npm run build` e `npm start`. Mantenha `.env` fora do Git e preserve a chave de criptografia. Sem dados de fonte/credenciais, o motor fica disponível mas não encontra produtos por conta própria.

Para operação 24h, hospede a aplicação com HTTPS em um processo/container continuamente ligado. Não foi contratado ou publicado um servidor nesta entrega; o GitHub é hospedagem do código, não da automação em execução. Tracking requer um domínio real encaminhando `/r/*`. Faça backup e acompanhe a cota do Supabase/Gemini.
