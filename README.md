# Pica Pau Motos · versão 3.0

Sistema de gestão da oficina com OS, orçamentos, balcão, serviço rápido, estoque,
clientes, motos, compras, fornecedores, equipe, financeiro, relatórios e controle
de acesso. Interface em português, com navegação para computador e celular.

Esta versão atualiza a aplicação enviada, mantendo React, Vite e Firebase.
Não cria um novo banco, não apaga cadastros e não inclui dados fictícios.

## Comece por aqui

- **[GUIA-DE-USO.md](GUIA-DE-USO.md):** onde encontrar e como usar as rotinas.
- **[MELHORIAS-V3.md](MELHORIAS-V3.md):** mudanças e correções desta versão.
- **[VALIDACAO.md](VALIDACAO.md):** verificações realizadas e limites da validação.
- **[CONFIGURAR-FIREBASE.md](CONFIGURAR-FIREBASE.md):** configuração do Firebase e do primeiro administrador.

## Instalação local

Requer **Node.js 22.17 ou superior**. O projeto foi verificado com Node.js 24.

1. Extraia o ZIP em uma pasta.
2. Abra um terminal nessa pasta e instale as dependências:

   ```sh
   npm ci
   ```

3. Faça uma cópia de `.env.example` chamada `.env` e preencha os valores do seu
   Firebase. Use o projeto que a oficina já utiliza para preservar os cadastros.
   O arquivo `CONFIGURAR-FIREBASE.md` explica cada campo.
4. Inicie o sistema:

   ```sh
   npm run dev
   ```

5. Acesse `http://localhost:3000` e entre com uma conta autorizada.

O servidor carrega o `.env` local também para as operações administrativas.
Nenhuma credencial de produção foi incluída neste pacote. O sistema requer
Firebase configurado e login válido; não há acesso de demonstração.

## Atualizar uma instalação existente

1. Conclua os atendimentos que estiverem abertos em formulários e finalize as
   vendas em espera. Baixe uma cópia dos dados pelo painel Administração.
2. Substitua o código da aplicação e mantenha o seu `.env` e o mesmo projeto Firebase.
3. Execute `npm ci`, `npm run verify` e `npm run build`.
4. Reinicie o servidor com `npm start` ou publique o novo código na hospedagem
   que a oficina já utiliza. Este pacote não altera a publicação atual.
5. Confira login, uma OS de conferência, recebimento e impressão antes de liberar
   a nova versão para a equipe. Não apague coleções nem cadastre novamente os usuários.

Não há migração destrutiva de dados nesta atualização. As regras do Firestore
existentes foram preservadas. Operações dependem das permissões combinadas dos
módulos envolvidos; por exemplo, baixar peças de uma OS também envolve o estoque.

## Hospedagem

Para um servidor Node, use `npm run build` e depois `npm start`. O comando de
inicialização funciona em Windows, macOS e Linux. As dependências de desenvolvimento
incluem o carregador TypeScript usado pelo servidor e devem ser instaladas.

O servidor Express atende as rotas de navegação e as APIs administrativas. A pasta
`dist/`, sozinha, contém apenas a interface: criar usuários e configurar o primeiro
administrador também requer as APIs e o Firebase Admin no servidor.

Em uma hospedagem diferente, configure o retorno para `index.html` nas rotas da
interface (`/oficina`, `/pdv`, `/estoque`, etc.), preservando os endpoints `/api`.
As variáveis `VITE_FIREBASE_*` precisam estar definidas **antes da compilação**.
A conta de serviço do Firebase Admin fica somente no servidor, sem prefixo `VITE_`.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Executar a interface e as APIs localmente |
| `npm run verify` | Verificar tipos e todos os grupos de testes automáticos |
| `npm run check:workspace` | Conferir navegação, permissões, prazos, busca e valores dos itens |
| `npm run build` | Compilar a versão de produção |
| `npm start` | Executar a versão de produção já compilada |

## Organização do código

- `src/components/OperationsOverview.tsx`: painel do dia e pendências.
- `src/components/OrdersWorkspace.tsx`: lista e cartões das OS.
- `src/components/OrderItemsEditor.tsx`: peças, serviços e quantidades da OS.
- `src/components/CounterWorkspace.tsx`: PDV e vendas em espera na sessão.
- `src/components/ActivityWorkspace.tsx`: históricos de compras e vendas.
- `src/components/WorkspaceSearch.tsx`: busca por registros e telas.
- `src/components/RecordPreview.tsx`: consulta de cadastros sem edição.
- `src/workspace.ts`: rotas, permissões e regras de busca e pendências.
- `src/order-items.ts`: quantidades e valores compatíveis com os registros existentes.
- `app/workspace.css`: visual e responsividade da nova interface.
- `app/page.tsx`: sessão, dados compartilhados e fluxos integrados.
- `app/firebase/client.ts`: acesso aos dados e operações de estoque.
- `server/` e `api/`: servidor e operações administrativas.

O histórico técnico da versão anterior foi preservado em
`docs/HISTORICO-TECNICO-V2.md`. Ele descreve comportamentos antigos; para a versão
atual, consulte primeiro os arquivos acima.
