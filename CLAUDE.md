# Tem o quê? (Marlene Interprise)

Gestão simples de vendas, fiado e estoque, multi-loja. Frontend React + Vite, backend em Cloudflare Worker com D1. `server.ts` e `server/` são o servidor Express/SQLite de desenvolvimento local; **produção roda `worker/index.ts`**.

## Fluxo
Testar local, commit, push direto na `main`. Deploy: `npm run cf:deploy` (aplicar antes `npm run cf:migrate:remote`).

## Mapa
- `worker/index.ts`: roteamento, auth por cookie assinado, API por loja (`/s/<slug>/api/*`), `/api/bootstrap`, idempotência e índices.
- `migrations/`: esquema D1. 0008 índices, 0009 `store_data_version`, 0010 `idempotency_keys`. **Aplicar a migration antes do deploy do Worker.**
- `src/App.tsx`: casca, abas (views carregadas com `lazy`), estado do servidor + fila otimista.
- `src/api/client.ts`: chamadas HTTP e `ApiError`.
- `src/api/localCache.ts`: IndexedDB com o último estado da loja (abre instantâneo, funciona sem rede).
- `src/api/outbox.ts`: fila de operações pendentes, reenvio com backoff, `Idempotency-Key` por operação.
- `src/api/optimistic.ts`: aplica operações da fila sobre os dados do servidor (venda, pagamento).
- `src/components/`: telas. `SyncStatusBar` mostra sincronização e recusas do servidor.
- `public/sw.js`: service worker (shell em cache, nunca toca em `/api`).
- `data/`: segredos e banco locais, **não versionar** (ignorados no `.gitignore`).

## Desempenho (como funciona)
- A API guarda em memória do isolate (15 s) a loja e a versão da credencial; trocar senha invalida na hora.
- Toda gravação bem-sucedida incrementa `store_data_version`. O app chama `/api/bootstrap?since=<versão>` e recebe `{unchanged:true}` se nada mudou, sem consultas pesadas.
- Venda, pagamento e baixa de pendência são otimistas: entram na fila, aparecem na tela e sincronizam em segundo plano. Recusa do servidor (4xx) vira aviso, nunca some em silêncio.
- Lojas gerenciadas usam tabelas `<tabela>__<id>`; os índices delas são criados em `ensureStoreSchema` e `createManagedStore`.
