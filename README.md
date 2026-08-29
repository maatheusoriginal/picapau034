# Pica Pau Motos — Sistema de Gestão da Oficina

Sistema web de gestão para oficina de motos: ordens de serviço, orçamentos, PDV de
balcão, serviço rápido, estoque, clientes e motocicletas, fornecedores, financeiro
(contas a pagar e a receber) e controle de equipe com permissões por usuário.

Não existe modo demonstração: sem login válido no Firebase, o sistema não abre.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | React 18 + TypeScript, build com Vite 7 |
| Estilo | CSS próprio (`app/globals.css`) + Tailwind via PostCSS |
| Banco e autenticação | Firebase Authentication + Cloud Firestore |
| Servidor | Express 4 (`server/`), com Firebase Admin SDK |

Em desenvolvimento o Express roda o Vite em *middleware mode*, então há um único
processo e uma única porta para a API e para a interface.

## Como rodar

Requer **Node.js 20 ou superior**.

```bash
npm install
cp .env.example .env    # preencha os valores (veja a seção abaixo)
npm run dev             # http://localhost:3000
```

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe a API e a interface em modo desenvolvimento com hot reload |
| `npm run typecheck` | Verifica os tipos (`tsc --noEmit`) — deve terminar sem nenhum erro |
| `npm run check:finance` | Confere as contas do financeiro contra um cenário montado à mão |
| `npm run check:inventory` | Confere as contas de estoque e precificação (markup e custo médio) |
| `npm run build` | Gera o pacote de produção em `dist/` |
| `npm start` | Sobe o servidor de produção servindo `dist/` (exige `npm run build` antes) |

`npm run build` **não** verifica tipos. Rode `npm run typecheck` antes de publicar.

## Variáveis de ambiente

As chaves do Firebase Web (`VITE_*`) vão para o navegador e são públicas por
natureza — quem protege os dados são as regras do Firestore, não o segredo dessas
chaves. Ainda assim elas não têm valor padrão no código: um ambiente mal
configurado falha com uma mensagem clara em vez de conectar silenciosamente no
projeto Firebase errado.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Estas duas ficam **somente no servidor** e nunca podem ir para o repositório:

```
FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=   # JSON completo da conta de serviço
INITIAL_SUPER_ADMIN_EMAIL=             # e-mail do primeiro Super Admin
```

O passo a passo completo de configuração do projeto no Firebase Console está em
[`CONFIGURAR-FIREBASE.md`](CONFIGURAR-FIREBASE.md).

## Estrutura

```
app/
  page.tsx           Aplicação: navegação, painéis, diálogos e sessão
  globals.css        Estilos da aplicação
  firebase/client.ts Toda a conversa com o Firebase no navegador
server/
  index.ts           Express: rotas da API e entrega da interface
  admin-users.ts     API administrativa de usuários (criar, editar, senha, apagar)
  bootstrap.ts       Criação do primeiro Super Admin
  firebase-admin.ts  Credencial do Admin SDK
src/
  types.ts           Fonte única dos tipos de domínio e das permissões
  finance.ts         Cálculos do financeiro (funções puras, sem Firebase)
  inventory.ts       Precificação e custo de estoque (funções puras)
  components/        Modais de cadastro e a área de Configurações
scripts/
  check-finance.ts   Confere as contas do financeiro
  check-inventory.ts Confere as contas de estoque e precificação
firestore.rules      Regras de segurança do banco
```

`src/types.ts` é a fonte única de verdade: a lista de permissões e os padrões por
cargo são importados de lá pela interface **e** pelo servidor. Adicionar uma
permissão em um lugar só não deixa mais front e back fora de sincronia.

## Painel administrativo

`/admin` abre o painel do Super Admin: o estado real do sistema (OS em aberto,
recebido hoje, cadastros, estoque em alerta) e um atalho para cada grupo de
configuração — usuários, oficina e OS, pagamentos, serviços rápidos, estoque,
categorias, parceiros, impressão e fornecedores.

Quando falta configurar algo essencial (dados da oficina, formas de pagamento,
categorias ou serviços rápidos), o painel mostra a lista do que falta e leva
direto à aba certa.

O endereço funciona ao recarregar a página porque o Express devolve o
`index.html` para qualquer caminho. Quem não é Super Admin cai na Visão geral.

## Configurações

Tudo que a oficina ajusta fica em **Configurações**, em oito abas: Oficina & OS,
Serviços Rápidos, Categorias, Pagamentos & Taxas, Parceiros & Frotas, Estoque &
Reposição, Impressão & WhatsApp e **Listas do sistema**.

A aba "Listas do sistema" guarda as opções que aparecem nos campos de escolha
espalhados pelo app — unidades de medida, marcas de motocicleta, caixas e
contas, prioridades da OS e níveis de combustível. Elas ficam em
`settings/lists` e valem para o sistema inteiro: antes cada tela trazia a sua
lista fixa no código, e algumas nem batiam entre si (a unidade padrão escolhida
em Configurações podia não existir como opção no cadastro da peça).

As categorias cadastradas na aba Categorias alimentam os filtros do catálogo do
PDV (grupo Produtos) e as categorias de gasto (grupo Despesas). Duas categorias
de gasto continuam fixas — "Peça comprada fora do estoque" e "Pagamento de
funcionário" — porque disparam comportamento próprio no formulário.

Toda lista tem um padrão de fábrica: enquanto a oficina não ajustar nada, o
sistema usa a lista original, sem tela vazia.

## Preço e custo das peças

Duas escolhas em **Configurações → Estoque & Reposição** mudam como o sistema
trata preço e custo. As contas ficam em `src/inventory.ts` e são conferidas por
`npm run check:inventory`.

**Modo de precificação**

- *Preço digitado à mão* (padrão): o preço de venda é livre e a margem apenas
  acompanha o que foi digitado.
- *Preço calculado pela margem*: o preço fica travado em `custo + margem`. Não
  há como vender abaixo do custo por um erro de digitação.

**Custo das peças**, aplicado a cada entrada de estoque:

- *Último preço pago* (padrão): o custo da peça vira o preço da compra mais
  recente.
- *Custo médio ponderado*: o custo vira a média pesada pela quantidade de cada
  lote. Dez peças a R$ 10 mais dez a R$ 20 dão custo de R$ 15, não R$ 20 — sem
  isso, o lucro das dez primeiras apareceria menor do que foi de verdade.

A entrada de estoque (**Compras e entradas → Nova entrada**) soma a quantidade e
recalcula o custo dentro de uma transação do Firestore, porque o custo médio
depende do estoque e do custo gravados naquele instante.

O cadastro de produto também passou a nascer com os padrões da oficina: markup
sugerido, estoque mínimo e unidade de medida.

## Como o dinheiro é contado

Todos os números do financeiro saem de `src/finance.ts`, para as telas não
discordarem entre si. As regras que valem a pena saber:

- **Entra em caixa** o que foi pago à vista: dinheiro, PIX, débito e crédito.
- **Não entra em caixa** a *troca de serviços* (compensa a dívida sem dinheiro)
  nem a *nota a prazo* — esta vira conta a receber.
- **Faturamento** conta vendas do balcão, serviços rápidos e **OS encerradas**.
  Uma OS ainda aberta não é faturamento.
- **Recebido líquido** já desconta a taxa da maquininha, gravada em cada venda.
- **Custo das peças** é gravado no item no momento da venda, então o lucro de
  ontem não muda quando o preço de custo do produto for reajustado hoje.
- **Saldo do caixa** é o recebido líquido menos os gastos já pagos.

`npm run check:finance` confere essas regras com um cenário montado à mão.

## Modelo de segurança

Esconder um botão na tela não é segurança. O bloqueio real está em três camadas:

1. **Firestore Rules** (`firestore.rules`) — decidem o que cada perfil pode ler e
   escrever direto no banco. Os campos que definem privilégio (`role`,
   `permissions`, `active`, `employeeId`, ...) só podem ser gravados pelo Super
   Admin; nenhum usuário consegue se promover editando o próprio documento.
   Os registros de auditoria só aceitam criação em nome de quem está logado, e
   nunca podem ser alterados ou apagados.
2. **API administrativa** (`server/admin-users.ts`) — criar, editar, apagar e
   redefinir senha exige um token válido de um Super Admin ativo. Usa o Admin SDK,
   que não passa pelas regras, então a checagem é feita a cada requisição. O
   sistema sempre exige que reste ao menos um Super Admin ativo.
3. **Interface** — menus e ações aparecem conforme as permissões, para não
   oferecer o que a pessoa não pode fazer.

### Senhas

O Super Admin cria a conta com uma senha temporária de 6 dígitos e entrega ao
funcionário. No primeiro acesso — e sempre que o administrador redefinir a senha —
o sistema **exige** que a pessoa troque a senha antes de abrir qualquer tela
(mínimo de 8 caracteres, não apenas números). Redefinir a senha também encerra as
sessões anteriores daquele usuário.

## Checklist de entrega

- [ ] `npm run typecheck` sem erros
- [ ] `npm run check:finance` com todas as contas batendo
- [ ] `npm run check:inventory` com todas as contas batendo
- [ ] `npm run build` conclui sem erros
- [ ] Variáveis `VITE_FIREBASE_*` configuradas no ambiente de produção
- [ ] `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` e `INITIAL_SUPER_ADMIN_EMAIL` cadastradas
      apenas como variáveis de servidor (nunca no repositório)
- [ ] Conteúdo de `firestore.rules` publicado no Firebase Console (**Firestore →
      Rules → Publish**) — publicar as regras é um passo manual e separado do deploy
- [ ] Login por e-mail/senha ativado no Firebase Authentication
- [ ] Domínio de produção liberado em **Authentication → Settings → Authorized domains**
- [ ] Primeiro Super Admin criado pela tela de configuração inicial
- [ ] Demais usuários liberados em **Usuários e acessos**

## Ponto em aberto

As regras e o cliente reconhecem um e-mail fixo como administrador de resgate
(`isBootstrappedAdmin`, em `firestore.rules` e em `app/firebase/client.ts`). É a
porta de entrada do dono da oficina caso o único Super Admin seja perdido. Depois
que houver mais de um Super Admin ativo e confirmado, vale remover esse e-mail dos
dois arquivos e passar a depender apenas de `INITIAL_SUPER_ADMIN_EMAIL`, que fica
no ambiente e pode ser trocado sem alterar código.
