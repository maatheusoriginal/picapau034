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
| `npm run check:documents` | Confere a OS impressa, o cupom e a mensagem de WhatsApp |
| `npm run check:import` | Confere a leitura da planilha de estoque |
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
  printing.ts        Envia o documento para a impressora e abre o WhatsApp
server/
  index.ts           Express: rotas da API e entrega da interface
  admin-users.ts     API administrativa de usuários (criar, editar, senha, apagar)
  bootstrap.ts       Criação do primeiro Super Admin
  firebase-admin.ts  Credencial do Admin SDK
src/
  types.ts           Fonte única dos tipos de domínio e das permissões
  finance.ts         Cálculos do financeiro (funções puras, sem Firebase)
  inventory.ts       Precificação e custo de estoque (funções puras)
  documents.ts       OS impressa, cupom e mensagem de WhatsApp (funções puras)
  import.ts          Leitura da planilha de estoque (funções puras)
  components/        Modais de cadastro e a área de Configurações
scripts/
  check-finance.ts   Confere as contas do financeiro
  check-inventory.ts Confere as contas de estoque e precificação
  check-documents.ts Confere os documentos impressos e a mensagem
  check-import.ts    Confere a leitura da planilha de estoque
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

**Baixa de estoque pela OS.** As peças de uma ordem de serviço saem do estoque
conforme a opção *"Baixar peça do estoque somente quando a OS for iniciada"*:

- Ligada (padrão): a peça só sai da prateleira quando a OS chega em **Em
  serviço**. Durante recepção, avaliação e aprovação a ordem ainda é orçamento,
  e reservar peça de orçamento some com o estoque de quem vende no balcão.
- Desligada: a peça sai já na abertura da OS.

A ordem guarda o que já tirou do estoque, então salvar duas vezes não baixa duas
vezes, tirar uma peça da OS devolve ela à prateleira, e voltar a ordem para
orçamento desfaz a reserva. No encerramento, os itens conferidos são os que de
fato foram usados e o estoque é acertado pela diferença.

O cadastro de produto também passou a nascer com os padrões da oficina: markup
sugerido, estoque mínimo e unidade de medida.

**Histórico da peça.** A aba *Movimentação*, no cadastro de um produto já
existente, mostra de onde a peça veio e para onde foi: compras, vendas do
balcão, serviços rápidos e ordens de serviço, com quantidade, valor unitário e
totais de entrada e saída. As saídas por OS aparecem pelo que foi **realmente
baixado** do estoque — uma OS ainda em orçamento lista a peça sem ter tirado
nada da prateleira, e por isso não conta.

## Impressão e WhatsApp

O botão **Imprimir** na OS e o encerramento do serviço geram o documento e
mandam para a impressora do navegador. A venda do balcão e o serviço rápido
emitem o cupom ao concluir.

Duas opções em **Configurações → Impressão & WhatsApp** valem aqui:

- **Formato**: *Cupom 80mm* (impressora térmica, fonte monoespaçada) ou *A4*.
- **Três vias**: ligado, sai uma via para o mecânico, uma para o caixa e uma
  para o cliente; desligado, só a do cliente.

A OS impressa traz os dados da oficina, cliente, moto, quilometragem, mecânicos,
problema relatado, itens com valores, total, a **garantia padrão** e as
**observações padrão** configuradas, além da linha de assinatura.

O botão **WhatsApp** monta a mensagem a partir do modelo configurado e abre a
conversa. Os marcadores disponíveis são `{cliente}`, `{moto}`, `{placa}`,
`{os}`, `{status}`, `{total}`, `{oficina}` e `{previsao}`. O telefone vem do
cadastro do cliente; sem cliente vinculado, o WhatsApp abre para escolher o
contato na hora.

O conteúdo é montado em `src/documents.ts` (funções puras) e conferido por
`npm run check:documents` — num documento impresso, um marcador não substituído
ou um nome com `&` quebrando o HTML só apareceria no papel, na frente do
cliente.

## Contas a receber e a pagar

Uma conta é um registro próprio, com as baixas guardadas dentro dela. Isso é o
que permite **quitar**: antes as contas a receber eram deduzidas na hora a partir
das vendas fechadas em "Nota a prazo", e por isso nunca saíam da lista — não
havia onde registrar que o cliente pagou, e o total só crescia.

- **Lançamento manual** de conta a receber ou a pagar, com categoria,
  vencimento e observações.
- **Parcelamento** com vencimento mensal. Os centavos da divisão vão para a
  primeira parcela: R$ 100 em 3 vezes dá 33,34 + 33,33 + 33,33, para a última
  — a que o cliente confere no fim — fechar redonda.
- **Baixa total ou parcial.** Uma conta com baixa parcial aparece como
  *Parcial*; quitada, sai da lista de abertas.
- Vendas e OS fechadas em **"Nota a prazo"** geram a conta a receber
  automaticamente, com vencimento em 30 dias.

As baixas entram no caixa: quitar uma conta a receber soma no "recebido hoje",
quitar uma a pagar soma nos gastos do dia.

As categorias do grupo **Receitas** classificam o que entra; as do grupo
**Despesas**, o que sai.

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

## Importar o estoque por planilha

Quem já tem as peças em planilha não precisa digitar tudo de novo. Em **Estoque →
Importar planilha**:

1. **Baixar modelo Sheets** gera o CSV com as colunas certas. A primeira linha de
   dados é um exemplo marcado com `EXEMPLO` no nome — ele mostra o formato de cada
   coluna e a importação o ignora, então não precisa apagar (mas pode).
2. **Escolher arquivo** lê a planilha e mostra a prévia: quantas peças serão
   cadastradas, quantas serão atualizadas e **quais linhas têm problema**, com o
   número da linha como aparece no Excel.
3. O botão só grava depois disso, e diz quantas peças vai importar.

Só **Nome** e **Quantidade** são obrigatórios. As demais colunas podem faltar ou
vir em branco; a ordem delas não importa e o cabeçalho pode estar sem acento.

| O que acontece | Regra |
| --- | --- |
| Peça já cadastrada | Casa por código de barras; sem código, casa por nome |
| Quantidade | **Substitui** a do sistema — a planilha é uma contagem, não uma entrada de mercadoria |
| Coluna em branco | Não apaga o que já está cadastrado |
| Preço sem custo, ou custo sem preço | O que faltar sai do markup sugerido, quando a precificação está por markup |
| Sem unidade / estoque mínimo / categoria | Usa o padrão configurado em Configurações |
| Linha com problema | Fica de fora e aparece na prévia; as outras entram normalmente |

Recusadas: linha sem nome, quantidade que não é número, quantidade negativa e peça
repetida dentro da própria planilha (a mensagem diz em que linha ela já apareceu).
Preço de venda abaixo do custo é apenas **avisado** — a peça entra, porque às vezes
é liquidação de verdade.

Detalhes que costumam morder:

- **Acento sai errado?** O Excel em português salva CSV em ANSI, não em UTF-8. O
  sistema detecta e converte (`decodeSheetBytes`), então tanto faz.
- **Separador**: `;` (Excel brasileiro) e `,` (Sheets em inglês) são reconhecidos
  pelo cabeçalho. Célula entre aspas pode conter o separador.
- **Números**: `25,00`, `25.00` e `1.234,56` são lidos igual.
- **Planilha grande**: a gravação vai em blocos de 400 (limite do Firestore). Se
  cair no meio, **importe o mesmo arquivo de novo** — as peças que já entraram são
  reconhecidas e só atualizadas, sem duplicar nada.

Importar exige permissão de gerenciar estoque; quem só consulta não vê o botão.

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
- [ ] `npm run check:documents` sem falhas
- [ ] `npm run check:import` sem falhas
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
