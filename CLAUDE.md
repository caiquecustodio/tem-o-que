# Tem o quê? (Marlene Interprise)

Gestão simples de vendas, fiado e estoque, multi-loja. Frontend React + Vite, backend em Cloudflare Worker com D1. `server.ts` e `server/` são o servidor Express/SQLite de desenvolvimento local; **produção roda `worker/index.ts`**.

## Fluxo
Testar local, commit, push direto na `main`. Deploy: `npm run cf:deploy` (aplicar antes `npm run cf:migrate:remote`).

## Mapa
- `worker/index.ts`: roteamento, auth por cookie assinado, API por loja (`/s/<slug>/api/*`), `/api/bootstrap`, idempotência e índices.
- `migrations/`: esquema D1. 0008 índices, 0009 `store_data_version`, 0010 `idempotency_keys`, 0011 reservas (`reservation_offers`, `orders`, `order_items`, `public_rate_limits`, `store_settings.whatsapp_phone`). 0012 custo (`products.cost_cents`, `sale_items.unit_cost_cents`). **Aplicar a migration antes do deploy do Worker.**
- `src/App.tsx`: casca, abas (views carregadas com `lazy`), estado do servidor + fila otimista.
- `src/api/client.ts`: chamadas HTTP e `ApiError`.
- `src/api/localCache.ts`: IndexedDB com o último estado da loja (abre instantâneo, funciona sem rede).
- `src/api/outbox.ts`: fila de operações pendentes, reenvio com backoff, `Idempotency-Key` por operação.
- `src/api/optimistic.ts`: aplica operações da fila sobre os dados do servidor (venda, pagamento).
- `worker/reservations.ts`: reservas e pedidos. Rotas da dona (`/api/offers`, `/api/orders`, `/api/production-sheet`) e rotas públicas (`/api/public/*`, cliente identificado por nome + 4 últimos dígitos do WhatsApp, cookie próprio `cust_<slug>`).
- `src/components/ReservationsView.tsx`: aba Reservas (pedidos, reservas abertas, ficha de produção). `PublicOrderView.tsx`: página pública `/s/<slug>/pedido` (catálogo, carrinho, Pix com QR/copiar, comprovante no WhatsApp); `src/api/publicApi.ts` é o cliente dela.
- `src/components/`: telas. `SyncStatusBar` mostra sincronização e recusas do servidor.
- `public/sw.js`: service worker (shell em cache, nunca toca em `/api`).
- `data/`: segredos e banco locais, **não versionar** (ignorados no `.gitignore`).

## Desempenho (como funciona)
- A API guarda em memória do isolate (15 s) a loja e a versão da credencial; trocar senha invalida na hora.
- Toda gravação bem-sucedida incrementa `store_data_version`. O app chama `/api/bootstrap?since=<versão>` e recebe `{unchanged:true}` se nada mudou, sem consultas pesadas.
- Venda, pagamento e baixa de pendência são otimistas: entram na fila, aparecem na tela e sincronizam em segundo plano. Recusa do servidor (4xx) vira aviso, nunca some em silêncio.
- Lojas gerenciadas usam tabelas `<tabela>__<id>`; os índices delas são criados em `ensureStoreSchema` e `createManagedStore`.

## Reservas e pedidos públicos
- Pedido nasce `pending_review` e **nunca** mexe em estoque ou saldo. A dona aprova; só `deliver` cria a venda (via `createSale`, uma única regra de venda) e, se o Pix foi confirmado, o pagamento, tudo no mesmo `batch`.
- Proteção da página pública: erro único na identificação (sem revelar se o nome existe), limite por IP e global (`public_rate_limits`, falha fechado) e Turnstile **opcional**: só exige se `TURNSTILE_SECRET` existir (e `TURNSTILE_SITE_KEY` exibe o widget). Configurar os dois antes de divulgar o link.
- Tabelas novas entram em `STORE_TABLES`; lojas existentes ganham as tabelas em `ensureReservationSchema` na primeira requisição.
- Dev local: `wrangler dev` em porta nova após cada `vite build` (o dev server não enxerga assets reconstruídos).

## Custo e lucro
- Custo de compra é **opcional** (`products.cost_cents`, null = não informado). Editável no Estoque (tela simples, que vale para todas as lojas) e no Catálogo. PUT sem `cost_cents` mantém; `null` ou vazio limpa. Entrada de estoque aceita `unit_cost_cents` e atualiza o custo atual.
- Cada venda congela o custo em `sale_items.unit_cost_cents`; mudar o custo depois não reescreve o lucro do passado.
- `GET /api/profit-report?startDate&endDate[&useCurrentCost=1]`: lucro só sobre itens com custo; o restante aparece como "sem custo". `useCurrentCost` estima vendas antigas usando o custo atual. UI: `ProfitReportView` (aba Lucro; na loja Lite fica abaixo do relatório rápido).
- Lojas antigas ganham as colunas em `ensureCostSchema` na primeira requisição.
