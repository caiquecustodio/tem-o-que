# Tem o quê?

Sistema web para administrar vendas a prazo (fiado), clientes, catálogo, estoque, recebimentos via Pix e relatórios de uma pequena loja.

## Recursos

- Painel com vendas, saldos em aberto e alertas de estoque.
- Registro de vendas por cliente, com atualização automática do estoque e do saldo.
- Cadastro de produtos e clientes.
- Contas individuais, registro de pagamentos e geração de cobrança Pix com QR Code.
- Controle de estoque, histórico de movimentações, relatórios e fechamento por período.
- Interface responsiva para celular e computador.
- Cartão fidelidade configurável por produto ou por compras gerais, com imagem individual atualizada no registro de cada compra.

## Requisitos

- Node.js compatível com Vite 8.
- npm.

## Executar localmente

Instale as dependências:

```bash
npm install
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). O servidor Express executa a API e serve a interface Vite. O banco SQLite é inicializado automaticamente em `data/`.

## Build de produção

```bash
npm run build
```

Para servir o build localmente, defina `NODE_ENV=production` e inicie o servidor:

```bash
npm start
```

O servidor usa a porta `3000`. O diretório `data/` contém os dados SQLite da loja; mantenha cópias de segurança desse diretório.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia Express e Vite em modo de desenvolvimento. |
| `npm run build` | Gera os arquivos estáticos em `dist/`. |
| `npm run preview` | Inicia o preview do Vite para o build. |
| `npm start` | Inicia o servidor Express. Em produção, serve `dist/`. |
| `npm run lint` | Verifica os tipos TypeScript. |

## Tecnologias

React, TypeScript, Vite, Tailwind CSS, Express e SQLite.

## Hospedagem na Cloudflare

Em produção, a interface estática é servida por Cloudflare Workers Assets e a API usa D1. O modo local continua usando Express e SQLite em `data/mercearia.db`.

Aplicação publicada: [tem-o-que.keizernavier.workers.dev](https://tem-o-que.keizernavier.workers.dev). A primeira loja cadastrada é Marlene Interprise. O acesso administrativo usa o login `marlene` e a senha já configurada para a loja.

O painel administrador fica na raiz do site e usa o login `admin`. Cada loja abre no mesmo domínio pelo caminho `/s/<slug>`; por exemplo, Marlene Interprise em `/s/marlene` e Minhoca Lanches em `/s/minhoca-lanches`. O login e o catálogo de cada loja são separados.

### Publicar

1. Instale as dependências com `npm install`.
2. Gere os segredos locais/de deploy uma vez com `node scripts/create-cloudflare-secrets.mjs`. Guarde a senha exibida; o arquivo com os segredos fica ignorado pelo Git.
3. Aplique o schema: `npm run cf:migrate:remote`.
4. Gere a build e publique: `npm run cf:deploy`.

O `wrangler.jsonc` liga o Worker `tem-o-que` ao D1 `marlene-interprise-db`. A variável secreta `LOGIN_PASSWORD` guarda a senha da loja e `SESSION_SECRET` assina cookies HttpOnly de sessão com validade de oito horas. O login administrativo é `marlene`. O login local continua desativado para preservar o fluxo SQLite atual.

Na versão publicada, a seção **Configurações da Loja e Pix → Segurança da conta** permite trocar a senha após confirmar a senha atual. A nova senha precisa ter pelo menos 12 caracteres; a alteração encerra as outras sessões.

As imagens do catálogo são ilustrações SVG escolhidas automaticamente pela categoria. O estoque foi zerado para iniciar o controle sem saldo inicial.

### Banco e migrações

O schema está em [`migrations/0001_initial_schema.sql`](migrations/0001_initial_schema.sql). Para transferir um arquivo SQLite existente, execute `node scripts/export-sqlite-to-d1.mjs caminho/mercearia.db data/d1-import.sql` e importe o arquivo com `npx wrangler d1 execute marlene-interprise-db --remote --file data/d1-import.sql`. O export contém dados financeiros e pessoais; não o compartilhe e remova-o após importar.

Para desenvolver no runtime Cloudflare, primeiro aplique a migração e importe os dados no D1 local, depois rode `npm run cf:dev`. O fluxo padrão `npm run dev` continua usando SQLite local.
