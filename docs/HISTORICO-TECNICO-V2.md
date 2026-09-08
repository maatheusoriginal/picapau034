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
| `npm run check:cash` | Confere o caixa: o esperado na gaveta e a conferência do fechamento |
| `npm run check:permissions` | Confere o que cada cargo recebe por padrão |
| `npm run check:api-imports` | Confere se as funções da Vercel conseguem carregar |
| `npm run check:mechanic` | Confere o quadro do mecânico (o que é dele e o que está livre) |
| `npm run check:backup` | Confere o que a cópia de segurança leva e quando ela avisa |
| `npm run check:hooks` | Confere se nenhum componente declara hook depois de um `return` antecipado |
| `npm run check:firestore-data` | Confere que nenhum campo vazio (`undefined`) escapa para o Firestore |
| `npm run check:number-input` | Confere que o campo de número deixa apagar o que está escrito |
| `npm run check:partner` | Confere o faturamento por empresa parceira (desconto, vencimento e caixa) |
| `npm run check:history` | Confere o histórico de atendimento (ordenação, total e o que entra) |
| `npm run check:text-case` | Confere o cadastro em maiúsculo, e varre os formulários atrás de campo que escapou |
| `npm run check:team-link` | Confere a ponte entre conta de acesso e cadastro de funcionário |
| `npm run check:pricing` | Confere as contas de preço e a criação rápida de categoria e marca |
| `npm run check:help` | Confere a central de ajuda: assuntos completos e apontando para abas que existem |
| `npm run check:nfe` | Confere a leitura da nota do fornecedor: fator de conversão, custo e casamento com o cadastro |
| `npm run check:settings-map` | Confere o mapa das Configurações: seções descritas, busca pelas palavras da oficina, e nenhuma seção órfã |
| `npm run check:barcode` | Confere o gerador de código de barras interno (EAN-13) |
| `npm run check:motorcycle-catalog` | Confere o catálogo de marca, modelo e versão de moto |
| `npm run check:plate` | Confere as regras de placa (padrão antigo, Mercosul e comparação) |
| `npm run check:report` | Confere o relatório do período: DRE, formas de pagamento, ranking e CSV |
| `npm run check:stock-adjust` | Confere o ajuste de estoque: diferença, motivo obrigatório e impacto em dinheiro |
| `npm run check:recurring` | Confere as contas que se repetem: próximo vencimento, o dia que não anda para trás e a trava contra duplicar |
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
  download.ts        Entrega um arquivo para a pessoa salvar
  ErrorBoundary.tsx  Rede de segurança: evita a tela branca e recupera versão nova
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
  cash.ts            Caixa: o dinheiro em espécie da gaveta (funções puras)
  mechanic.ts        Quadro do mecânico: minhas OS e as da oficina (funções puras)
  backup.ts          O que entra na cópia de segurança e quando avisar (funções puras)
  components/        Modais de cadastro e a área de Configurações
scripts/
  check-finance.ts   Confere as contas do financeiro
  check-inventory.ts Confere as contas de estoque e precificação
  check-documents.ts Confere os documentos impressos e a mensagem
  check-import.ts    Confere a leitura da planilha de estoque
  check-cash.ts      Confere o caixa e a conferência do fechamento
  check-permissions.ts Confere as permissões padrão de cada cargo
  check-api-imports.ts Confere as extensões .js dos imports das funções
  check-mechanic.ts  Confere o quadro do mecânico
  check-backup.ts    Confere a cópia de segurança
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

## Pagamento dividido e troco

O botão "Dividir pagamento" existia, abria quatro campos e **não gravava nada**:
a venda entrava com uma forma só. O cliente pagava R$ 100 no PIX e R$ 50 em
dinheiro, o caixa esperava R$ 150 na gaveta, e a conferência fechava errado sem
ninguém entender por quê.

Agora as partes são gravadas na venda (e na OS) e cada uma vai para o lugar
certo:

| Parte | Para onde vai |
| --- | --- |
| Dinheiro | Gaveta do caixa |
| PIX, débito, crédito | Conta (com a taxa da maquininha só sobre essa parte) |
| Nota a prazo | Conta a receber, **só desse pedaço** |

O restante é **calculado**, não digitado: é como se divide no balcão ("R$ 50 no
dinheiro, o resto no PIX") e evita a soma não fechar por erro de digitação. A
soma tem que bater ao centavo — aceitar diferença seria gravar uma venda que não
corresponde ao que o cliente pagou, e a sobra apareceria no fechamento como se
fosse erro de alguém.

O cupom impresso mostra cada forma com seu valor.

**Troco**: o campo "valor recebido" e o troco eram fixos em R$ 0,00. Agora o
troco é calculado sobre a parte em espécie — inclusive numa venda dividida, onde
só o pedaço em dinheiro conta.

### Como o resto do sistema enxerga

`paymentsOf()` é o adaptador: devolve as partes como lista, e transforma uma
venda antiga (que só tem `paymentMethod`) numa lista de um item. Por isso nada
quebrou nos registros que já existiam.

O faturamento soma o que **virou dinheiro** (`settled`), não o total da venda.
Numa venda dividida com parte fiada, esse pedaço entra no faturamento quando o
cliente pagar, pela baixa da conta a receber — somar as duas coisas contaria o
mesmo dinheiro duas vezes.

## Caixa

O caixa é o **dinheiro em espécie da gaveta**, e só ele. Venda no PIX, no débito
ou no crédito não entra: aquele dinheiro foi para a conta e nunca passou pela mão
de ninguém.

Essa separação é o que faz o fechamento valer alguma coisa. Se o esperado
incluísse o PIX do dia, o caixa acusaria uma falta enorme todo dia, ninguém
olharia mais para o número — e é assim que um desvio de R$ 50 passa despercebido
por meses. O saldo do negócio (recebido menos pago, com PIX e cartão dentro)
continua no Financeiro; são duas contas diferentes de propósito.

### O dia a dia

1. **Abrir caixa** — informe o fundo de troco que já está na gaveta. Só pode
   haver um caixa aberto por vez; a tela mostra qual é e quem o abriu.
2. Durante o dia, o caixa se alimenta sozinho: venda no PDV em dinheiro, OS
   encerrada em dinheiro, cliente que quitou um fiado em dinheiro (entra) e gasto
   pago em dinheiro (sai).
3. **Suprimento** põe dinheiro na gaveta (troco extra); **sangria** tira
   (depósito no banco). Ambos pedem motivo — sem ele ninguém entende o
   lançamento depois. Sangria acima do que há na gaveta é recusada.
4. **Fechar caixa** — conte o dinheiro e digite o valor. A tela compara com o
   esperado e mostra **Confere**, **Sobra** ou **Falta** antes de você confirmar.

### O que fica gravado

O fechamento grava o contado **e** o esperado daquele momento, além da diferença.
Recalcular o esperado meses depois daria outro número se algum lançamento antigo
for corrigido — e aí a falta que alguém precisava explicar simplesmente sumiria.
Pelo mesmo motivo, fechar duas vezes é recusado e apagar uma sessão é só do Super
Admin: quem causou a falta é exatamente quem teria motivo para apagá-la.

### Detalhes

- **Conta esperada**: fundo de troco + vendas e OS em dinheiro + fiados quitados
  em dinheiro + suprimentos − sangrias − gastos pagos em dinheiro.
- Uma diferença abaixo de um centavo conta como **Confere**: arredondamento de
  parcela não é erro de caixa.
- Caixa aberto há mais de 20 horas aparece com um aviso — quase sempre é o caixa
  de ontem que ninguém fechou.
- No fechamento a tela também mostra, à parte, quanto entrou em PIX, débito e
  crédito na sessão, para deixar claro que aquele valor **não** deve estar na
  gaveta.
- Abrir, movimentar e fechar exige permissão de gerenciar o financeiro. Quem
  opera o PDV consegue ver se o caixa está aberto, mas não mexe na conferência.

## Movimentação avulsa e desconto na venda

### Desconto no PDV

O campo **Desconto** no resumo da venda abatia nada: o botão abria o diálogo de
movimentação financeira, que nunca teve relação com o carrinho, e o total
continuava cheio. Agora o valor é digitado ali mesmo e desce por todo o caminho:
o pagamento cobra o valor com desconto, a venda grava `subtotal` e `discount`
separados, e o cupom impresso mostra as três linhas (subtotal, desconto, total).

Desconto maior que o subtotal é **recusado**, não aparado em silêncio: se alguém
digitou 500 num carrinho de 50, o certo é a pessoa ver o erro — e não a venda
sair por zero.

### Movimentação lançada à mão

**Financeiro → Nova movimentação** registra o dinheiro que não é venda nem conta
agendada: venda de sucata, devolução de fornecedor, aporte do dono, frete pago na
hora.

O que ela **não** faz, de propósito:

| Isso | Vai aqui |
| --- | --- |
| Sangria e suprimento | No **caixa** |
| Conta com vencimento | Em **Contas a pagar** |
| Venda de peça ou serviço | No **PDV** ou na **OS** |

Ter dois caminhos para a mesma coisa faria a conferência da gaveta contar o mesmo
dinheiro duas vezes, e ninguém entenderia a diferença no fim do dia.

Os motivos saem de **Configurações → Listas do sistema** (Motivos de entrada e
Motivos de saída), então a oficina ajusta os seus sem mexer no código.

Uma movimentação **em dinheiro** entra na conferência do caixa aberto. Em PIX ou
cartão, só no saldo do negócio.

**Movimentação manual mexe no dinheiro, não no faturamento.** Aporte do dono e
venda de sucata não são serviço prestado: somá-los ao faturamento estragaria o
ticket médio e a leitura de como a oficina está vendendo. Elas entram em saldo em
caixa, recebido do dia e lucro; ficam fora de faturamento, ticket médio e
contagem de vendas.

## Usuários e acessos

**Usuários e acessos** (só Super Admin) cria a conta no Firebase Authentication e
o perfil de acesso na mesma operação. Se algum passo falhar no meio, a conta
recém-criada é apagada — melhor nenhum usuário do que um pela metade.

O que dá para fazer depois: mudar nome, e-mail (muda o login de verdade),
telefone, cargo, vínculo com funcionário e ativo/inativo; redefinir a senha
temporária (encerrando as sessões abertas da pessoa); e apagar o usuário. Toda
alteração fica registrada em `auditLogs`.

Duas travas contra se trancar para fora: ninguém desativa ou apaga a própria
conta, e o último Super Admin ativo não pode ser rebaixado nem removido.

### Permissões

O cargo (Super Admin, Balcão, Mecânico) define um **ponto de partida**; quem cria
o usuário marca e desmarca cada permissão na lista. Super Admin recebe tudo
automaticamente e não tem lista.

**Nada é concedido fora do que foi marcado.** Havia uma exceção: o mecânico
vinculado ao funcionário de id `USR-003` ganhava "abrir OS" e "ver equipe"
sozinho, porque era o que fazia sentido para o Ronaldo dos dados de exemplo. Numa
oficina de verdade esse id é outra pessoa qualquer, e o efeito era um funcionário
aparecer com permissão que o administrador não deu. A exceção foi removida, e
`npm run check:permissions` existe para impedir que outra apareça — inclusive um
caso que quebra se alguém acrescentar um segundo parâmetro à função.

Padrões por cargo:

| | Super Admin | Balcão | Mecânico |
| --- | --- | --- | --- |
| Ver e atualizar OS | sim | sim | sim |
| Abrir OS | sim | sim | **não** |
| PDV e serviço rápido | sim | sim | não |
| Ver estoque | sim | sim | sim |
| Gerenciar estoque | sim | sim | não |
| Clientes | sim | ver e cadastrar | só ver |
| Financeiro | sim | sim | não |
| Ver equipe | sim | não | não |

### Depende da credencial do servidor

Criar, editar, apagar e redefinir senha usam o Admin SDK e exigem
`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` configurada. Sem ela a tela ainda **lista**
os usuários (modo de leitura, lendo o Firestore), mas as operações falham com
erro de configuração. Como o Admin SDK não passa pelas regras do Firestore, a
criação de usuário funciona mesmo antes de publicar `firestore.rules`.

## Publicar na Vercel

O sistema **não é um site estático**. Três rotas rodam no servidor e são o que
permite criar o primeiro Super Admin e gerenciar usuários:

| Rota | Para quê |
| --- | --- |
| `GET /api/health` | Diz se o backend está de pé e se a credencial está configurada |
| `GET/POST /api/admin/users` | Listar, criar, editar, apagar usuário e redefinir senha |
| `POST /api/setup/bootstrap` | Criar o primeiro Super Admin |

Localmente elas sobem no Express (`npm run dev`). Na Vercel, a pasta `api/` vira
funções serverless — os arquivos ali só decidem o método HTTP e chamam **os
mesmos handlers** de `server/`. Nenhuma lógica de permissão é duplicada, que é
exatamente onde duas cópias divergem com o tempo e abrem brecha.

Para isso funcionar, os handlers foram tipados com `ApiRequest`/`ApiResponse`
(ver `server/http.ts`) em vez de `Request`/`Response` do Express: descrevem só o
que os handlers usam (cabeçalhos, corpo, status, json), e tanto o Express quanto
a Vercel atendem a essa forma.

### As oito variáveis de ambiente

Todas em **Produção e Pré-visualização**. Ver `.env.example`, que traz as oito
com explicação.

As seis `VITE_FIREBASE_*` são obrigatórias — sem elas o sistema para na abertura
com "Configuração do Firebase incompleta". Não são segredo: vão para dentro do
navegador de qualquer visitante.

`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` **é chave-mestra** e nunca sai das
variáveis de ambiente. `INITIAL_SUPER_ADMIN_EMAIL` é o e-mail que pode concluir
a configuração inicial.

### Imports precisam da extensão `.js`

O projeto é ESM (`"type": "module"`) e a Vercel compila as funções **sem
empacotá-las**. Nesse modo o Node exige a extensão nos imports entre arquivos:

```ts
import { getAdminUsers } from "../../server/admin-users.js";  // certo
import { getAdminUsers } from "../../server/admin-users";     // 500 em produção
```

Sem a extensão, o typecheck passa, o build passa, o deploy sobe — e a função
morre no primeiro acesso com `ERR_MODULE_NOT_FOUND`. Nem `tsx` nem o Vite pegam
isso, porque os dois resolvem sem extensão. `npm run check:api-imports` confere
`api/` e `server/` e falha se faltar alguma.

### Como diagnosticar

Abra `https://SEU-ENDERECO/api/health`:

| Resposta | Significa |
| --- | --- |
| **404** | As funções não subiram. Confira se a pasta `api/` foi publicada |
| `firebaseAdminConfigured: false` | Subiram, mas falta a credencial no ambiente |
| `firebaseAdminConfigured: true` | Tudo certo |

Sem as rotas, a tela de usuários ainda **lista** quem já tem perfil (ela lê o
Firestore direto) e mostra um aviso — foi assim que este problema apareceu. Mas
criar e editar falham.

## Situações da OS

```
Recepção → Avaliação → Aprovação → Em serviço → Aguardando peça → Entrega
```

**A ordem da lista importa de verdade.** `shouldReserveStock` decide pela
POSIÇÃO se a peça já saiu do estoque ("da bancada em diante"), então mover uma
situação na lista muda quando o estoque é baixado. "Aguardando peça" fica depois
de "Em serviço" justamente por isso: o serviço começou, as peças que existiam já
foram baixadas, e parar para esperar uma que faltou não devolve as outras para a
prateleira.

**Aguardando peça** existe porque a moto parada era invisível: ela ficava em "Em
serviço" e ninguém sabia que estava esperando fornecedor. Agora aparece em
vermelho no quadro do mecânico, no filtro "Em andamento", no cartão de "Em
serviço" ("2 parada(s) esperando peça") e como etapa própria no funil da Visão
geral.

As cores: verde é entregue, âmbar é serviço andando, violeta é orçamento sendo
feito, e **vermelho são as duas situações em que a moto está parada esperando
outra pessoa** — o cliente aprovar ou o fornecedor entregar. É o que precisa
saltar aos olhos de quem olha o quadro.

## Quadro do mecânico

Quem entra com o perfil **Mecânico** vê, em "Ordens de serviço", um quadro no
lugar da tabela de seis colunas. O dono e o balcão continuam com a tabela: eles
precisam da visão da oficina inteira; o mecânico precisa de duas respostas, no
celular, com uma mão suja de graxa.

| Seção | O que traz |
| --- | --- |
| **Minhas ordens** | As OS atribuídas a ele, abertas |
| **Na oficina** | As demais OS abertas — o que ele pode puxar |

A segunda seção existe por um motivo concreto: quando a peça de uma OS não
chegou, o mecânico não fica parado, puxa outra para adiantar. Sem enxergar o que
está livre, ou ele fica ocioso ou vai perguntar para alguém.

### Um toque muda a situação

Cada linha traz o passo seguinte, sem abrir a OS:

| Situação | Botão(ões) | Vai para |
| --- | --- | --- |
| Recepção, Avaliação, Aprovação | Iniciar | Em serviço |
| Em serviço | **Falta peça** / **Pronta** | Aguardando peça / Entrega |
| Aguardando peça | Peça chegou | Em serviço |
| Entrega | — | (só "Abrir") |

"Em serviço" tem dois botões porque terminar e travar esperando peça acontecem
com a mesma frequência. Deixar o segundo escondido atrás de "Abrir" era o que
fazia ninguém registrar a espera — e a oficina não enxergar a moto parada.

Os rótulos são curtos de propósito: com três botões na linha, texto longo
espremia o nome do cliente até quebrar em quatro linhas no celular.

"Abrir" continua levando ao diálogo completo, com todas as situações, peças,
impressão e WhatsApp. O botão de um toque cobre o caso comum; o diálogo cobre o
resto.

Uma OS que **outro mecânico já está fazendo** não tem botão rápido: assumir o
serviço do colega sem ele saber é pior que dar dois toques a mais. Abra a OS e
converse. Uma OS parada esperando peça, sim — quem tem a peça na mão resolve
mais rápido que quem começou.

**Pegar uma OS da oficina acrescenta o mecânico à equipe** — não substitui quem
já estava. Duas pessoas na mesma moto é comum, e apagar o responsável anterior
faria a oficina perder de vista quem começou o serviço. Com "um mecânico por OS"
configurado, assumir passa a ser troca, que é o que a configuração pede.

A baixa de estoque segue a mesma regra do diálogo da OS, inclusive a
configuração "baixar peças só quando o serviço começa" — a conta é a mesma
função, não uma cópia, senão a peça sairia duas vezes ou nenhuma dependendo de
por onde a situação foi mudada.

### Vínculo com o funcionário

O quadro sabe o que é "dele" comparando o **funcionário vinculado ao usuário**
com os mecânicos da OS. Usuário sem vínculo não tem nada em "Minhas ordens" — a
tela avisa isso explicitamente, porque a causa é o cadastro do usuário e não a
falta de serviço. O vínculo é feito em **Usuários e acessos → Vincular ao
funcionário**.

### No celular

O quadro é feito para o telefone, porque é ali que o mecânico usa o sistema — de
pé na bancada, com uma mão. Cinco coisas mudam por causa disso — as três
primeiras só abaixo de 560px de largura, as duas últimas em qualquer tela:

**Os três cartões do resumo viram uma faixa de três colunas.** Empilhados, eles
somavam quase 300px e empurravam a primeira OS para fora da tela: o mecânico
abria "Ordens de serviço" e via três números antes de ver qualquer moto. Na
faixa o número continua lá e a primeira OS aparece inteira, com os botões.

**"Nenhuma OS com você" deixa de ocupar 260px.** O aviso de lista vazia é o
mesmo do resto do sistema, desenhado para o meio de um painel grande. No quadro
do mecânico ele fica bem em cima de "Na oficina · para pegar" — ou seja, quem
está sem serviço na mão via um quadro dizendo que não tem serviço e precisava
rolar para achar o que estava livre. No celular ele vira uma faixa com o ícone
ao lado do texto.

**Os botões da linha ocupam a largura toda, com 44px de altura.** Eram 31px de
altura por 41px de largura — abaixo do mínimo em que o dedo acerta sem ampliar a
tela, e "Falta peça" ficava colado em "Pronta".

**O relato do cliente aparece na linha.** Sem ele, descobrir qual das OS é a que
se vai pegar agora exigia abrir uma por uma. O texto é cortado na palavra, nunca
no meio dela — um corte em "BARULHO NA RELA…" faz abrir a OS só para ler o
resto, que é justamente o toque que o resumo existe para poupar.

**A OS aberta mostra o cliente e as peças aprovadas.** `.order-info-grid` e
`.order-section` usam `overflow: hidden` para arredondar as bordas internas, e
isso zera o mínimo automático deles: dentro de um grid com altura definida — o
corpo do diálogo no celular — os dois encolhiam para 15px de altura com 288px e
142px de conteúdo dentro. O mecânico abria a OS e não via nem de quem era a moto
nem o que estava aprovado. O corpo do diálogo agora usa
`grid-auto-rows: max-content`, então cada cartão fica do tamanho do conteúdo e a
página rola. No computador nada muda: lá o conteúdo já cabia.

A barra de etapas da OS era um grid de cinco colunas para as **seis** situações
de `serviceOrderStatuses`, então "Entrega" caía numa segunda linha e a linha de
ligação saía pela borda — em qualquer tamanho de tela, não só no celular. Agora
ela é flex e cada etapa vale uma fração do que existir: acrescentar ou tirar uma
situação não mexe mais no CSS.

O passo 36 do roteiro ponta a ponta entra como mecânico num aparelho de 390×844,
pega uma OS com um toque, confere no Firestore que o mecânico foi gravado, e
cobra o resto: a primeira OS inteira na tela, botões de 44px, o relato na linha,
nenhum cartão achatado dentro da OS, as seis etapas numa linha só e nenhuma
rolagem lateral.

## Tela branca e versões novas

Não existia nenhuma rede de segurança: qualquer exceção durante a renderização
fazia o React desmontar tudo, e a pessoa ficava olhando para uma tela branca —
sem mensagem, sem botão, sem saída.

A causa mais comum nem era bug de lógica. É o app ficar aberto no celular
enquanto uma versão nova é publicada: a página velha continua pedindo pedaços de
tela com o nome antigo (`ProductFormModal-D2cwv3J_.js`), que já não existem no
servidor, e o import falha. Reproduzido bloqueando esse arquivo — dá tela branca
com `Failed to fetch dynamically imported module`.

`app/ErrorBoundary.tsx` cobre a aplicação inteira **e** cada formulário
carregado sob demanda, então um modal que não carrega não derruba a tela atrás
dele. Quando reconhece o caso de versão nova, recarrega a página **uma vez** —
marcado em `sessionStorage` para nunca virar laço, e limpo quando o app abre
inteiro, para o próximo deploy também se resolver sozinho. Se o
`sessionStorage` estiver bloqueado (janela anônima), mostra a mensagem em vez de
recarregar às cegas.

### A segunda causa: hooks depois de um `return`

A rede de segurança acima trata o modal que não carrega. A tela branca que
sobrava tinha outra origem, encontrada só quando o sistema foi rodado de ponta a
ponta contra um banco de verdade:

```
Rendered more hooks than during the previous render.
The above error occurred in the <ModuleWorkspace> component
```

O React exige que **todo componente chame exatamente os mesmos hooks, na mesma
ordem, em toda renderização**. Dois lugares quebravam essa regra:

- `ModuleWorkspace` declarava dois `useMemo` **depois** de dez `return`
  antecipados (`if (active === "PDV Balcão") return ...`). Sair de uma aba que
  retorna cedo para uma que não retorna mudava a contagem de hooks e derrubava a
  tela.
- `AppDialog` fica montado o tempo todo e declarava **86 hooks depois** dos
  cinco `return` dos formulários de produto, fornecedor, moto, cliente e
  funcionário.

Nos dois casos a correção é a mesma e não muda nada visualmente: todo hook subiu
para antes do primeiro `return`.

Para o defeito não voltar, `npm run check:hooks` lê `app/` e `src/`, marca onde
cada componente começa, conta a profundidade de chaves caractere a caractere
(para não se confundir com a lista de props em várias linhas nem com `return`
dentro de um `.map`) e falha se encontrar um hook abaixo de um `return`
antecipado. Rodado contra a versão com o defeito, aponta os 88 hooks fora de
lugar; contra a versão corrigida, passa limpo.

## Teste ponta a ponta com o emulador do Firebase

Os `check:*` conferem contas em funções puras. Eles não provam que a tela grava
no banco. Para isso o repositório traz a configuração do **Firebase Emulator
Suite**, que sobe um Firestore e um Auth locais **com o `firestore.rules` de
verdade carregado** — sem tocar nos dados da oficina.

Em três terminais:

```bash
npx -y firebase-tools emulators:start --project picapau-teste  # Auth :9099, Firestore :8080
npm run dev:emulador                                           # interface em :5199, lendo .env.emulador
npm i --no-save playwright-core && npm run e2e:emulador        # o roteiro de teste
```

`firebase.json`, `.firebaserc` e `.env.emulador` estão versionados; o
`.env.emulador` só tem valores falsos. Quando `VITE_FIREBASE_EMULATOR=1`,
`app/firebase/client.ts` aponta o app para os emuladores; em produção a variável
não existe e nada disso roda. Se a interface subir em outra porta, passe
`URL_TESTE=http://127.0.0.1:PORTA`.

Nem o `firebase-tools` nem o `playwright-core` são dependências do projeto, de
propósito: juntos passam de meio giga, só servem para este teste e atrasariam a
instalação na Vercel. Por isso vêm por `npx -y` e `--no-save`.

### O que o roteiro faz

`scripts/emulador/e2e.mjs` apaga o banco, semeia um Super Admin
(`scripts/emulador/semear.mjs`, `dono@picapau.test` / `teste123`), abre o
navegador e faz o dia da oficina. **Cada resultado é conferido no Firestore, não
no texto da tela** — a tela pode mostrar o que quiser:

| Passo | O que prova |
| --- | --- |
| 1 | Abre o caixa com R$ 200 de fundo e grava `CX-0001` |
| 2 | Cadastra uma peça com custo 25 e estoque 10 |
| 3 | O preço nasce de `custo + margem` e é gravado formatado (`R$ 40,00`) |
| 4 | Venda no PDV com R$ 5 de desconto grava `total: 35` e a forma `Dinheiro` |
| 5 | O estoque cai de 10 para 9 no banco |
| 6 | OS completa com placa, problema e mão de obra; cliente e moto viram cadastro |
| 7 | A OS vai até a entrega, é recebida em dinheiro e encerrada |
| 8 | Serviço rápido de R$ 80 recebido no balcão |
| 9 | Entrada de estoque de 10 peças sobe o saldo de 9 para 19 |
| 10 | Conta a receber de R$ 200 lançada |
| 11 | Gasto de R$ 40 pago pelo caixa **gravado no banco** |
| 12 | Sangria de R$ 50 entra na sessão de caixa |
| 13 | A gaveta fecha em R$ 375 (200 + 35 + 150 + 80 − 40 − 50) com "Confere" |
| 14 | Todas as coleções esperadas existem no banco |
| 15 | As 16 abas do menu abrem sem quebrar a tela |
| 16 | Os 5 formulários de cadastro abrem e fecham sem quebrar a tela |

Foi assim que os dois defeitos de hooks acima apareceram: o passo 4 derrubava a
aplicação inteira.

### Campo vazio derrubava a gravação inteira

O passo 11 pegou o defeito mais caro de todos. O formulário de gasto montava
`supplierId: expenseSupplierId || undefined` — ou seja, `undefined` sempre que
ninguém escolhia fornecedor, que é o caso comum. O Firestore recusa o documento
inteiro quando encontra um `undefined`, e a gravação em lote é atômica.

O resultado era silencioso e caro: a tela dizia "Gasto registrado e descontado do
saldo da oficina", o saldo do caixa caía na hora, e **nada era gravado**. Quem
recarregasse a página via o dinheiro de volta na gaveta, com a nota já paga — e o
fechamento do caixa acusaria uma quebra que não existia.

A limpeza agora fica em `src/firestore-data.ts`, aplicada em **todos** os
caminhos de gravação de `app/firebase/client.ts` — não em cada formulário, que é
onde o próximo campo opcional voltaria a escapar. Campo ausente é diferente de
campo nulo: com `merge: true`, omitir preserva o que já estava gravado, que é o
comportamento certo para "não informado". `npm run check:firestore-data` prova
que zero, texto vazio, `false` e `null` continuam gravando — só `undefined` sai.

## Campos de número

Todo campo numérico do sistema era controlado direto por um número:

```tsx
onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
```

Apagar o conteúdo faz `parseFloat("")` virar `NaN`, o `|| 0` devolve zero **na
mesma tecla**, e o campo volta a mostrar `0` antes de a pessoa terminar de
digitar. O que ela digita em seguida entra depois do zero — `020` no lugar de
`20` — e a única saída é selecionar tudo e substituir. Eram 25 campos assim, em
sete telas: preço da mão de obra, taxas da maquininha, salário, comissão,
estoque mínimo, margem, quantidade e custo da entrada, limite de crédito.

`src/components/NumberField.tsx` guarda o **texto** como estado próprio, separado
do valor que vale. O campo pode ficar vazio ou com um número pela metade (`1,`,
`-`) enquanto se digita; o valor continua subindo a cada tecla, para as telas
que reagem na hora — no cadastro de peça, mudar o custo recalcula o preço —; e
só ao sair do campo o texto é normalizado. Campo deixado vazio cai no padrão
declarado (`fallback`), que é o mesmo número do antigo `|| N`, e não num zero
silencioso.

`blankValue` cobre os formulários que já mostravam vazio no lugar do zero para
o placeholder `0,00` continuar visível — faziam isso à mão com
`value={custo === 0 ? "" : custo}`, o que resolvia só a aparência.

As regras ficam em `src/number-input.ts` e `npm run check:number-input` confere
as 31: que vazio, `1,` e `-` são estados válidos no meio da digitação; que
`20` aparece como `20` e nunca `020`; que sair vazio cai no padrão mas sair com
`0` digitado mantém o zero; e que `min`/`max` continuam valendo.

Os campos que guardam texto puro (valor do gasto, valor da conta, mão de obra
avulsa) nunca tiveram o defeito e foram deixados como estavam.

## Todo cliente precisa de uma moto vinculada

Numa oficina não existe cliente sem moto. Sem a placa vinculada, a próxima OS
dessa pessoa **não a encontra pela busca por placa** — que é como o balcão
procura quando a moto chega no portão.

O cadastro de cliente passa a ter um bloco **Motocicleta do cliente** com placa
(obrigatória), marca, modelo, versão, ano e cor, e grava as duas coisas no mesmo
salvar. Quem já tem moto cadastrada não precisa informar outra: a exigência é
ter pelo menos uma, não uma a cada edição.

Duas recusas explícitas, em vez de gravar errado calado:

- placa fora dos padrões brasileiros (`ABC-1234` ou `ABC-1D23`);
- placa que já é de outro cliente. O id da moto sai da placa, então gravar por
  cima **trocaria o dono da moto de alguém** — o aviso diz de quem ela é.

Chamado de dentro da OS, o formulário já abre com a placa e o modelo que foram
digitados lá: repetir a digitação é onde nasce a divergência entre as duas telas.

As regras de placa saíram do `app/page.tsx` para `src/plate.ts`, porque agora
duas telas precisam delas, e `npm run check:plate` confere as 23 — incluindo que
`ABC-1D23` e `abc1d23` são a mesma moto e caem no mesmo documento.

## OS sem cliente identificado

A moto chega de guincho, ou o cliente deixa e sai correndo. A etapa 1 da OS
ganha **"Atender sem cadastrar agora"** ao lado de "Cadastrar cliente": a OS
abre com a placa, a peça sai do estoque e o serviço anda normalmente.

**O encerramento é que cobra.** Antes de receber, a tela pede nome e WhatsApp e
recusa fechar sem eles — sem isso a oficina fica com o serviço feito e ninguém
para cobrar. Ao encerrar, o cliente vira cadastro e a moto passa a ser dele.

A moto é cadastrada mesmo sem o dono: é a placa que segura a ordem, e sem o
cadastro a próxima entrada da mesma moto não a encontraria.

## A primeira etapa da OS

Esta tela tinha **três caminhos sobrepostos** ao mesmo tempo: uma busca por
cliente, outra por placa, um formulário embutido que aparecia sozinho sempre que
a busca não achava nada — inclusive com o campo ainda vazio — e ainda dois botões
de cadastro completo. Quem abria a OS não sabia por onde começar nem em qual dos
campos digitar.

Agora são **dois blocos numerados, na ordem em que a oficina trabalha**:

**1 · Cliente** — a escolha entre **cliente** e **empresa parceira** (ver
"Empresa parceira", adiante) e, para cliente, um campo de busca só, que aceita
WhatsApp ou nome. Cada bloco tem um estado de cada vez:

| Estado | O que aparece |
| --- | --- |
| Procurando | O campo e uma dica |
| Achou | A **lista** de quem bateu, com telefone e placas, para clicar |
| Não achou | "Nenhum cliente com X" + botão **Cadastrar cliente** |
| Cadastrando | Nome e WhatsApp, com atalho para o cadastro completo |
| Escolhido | O cliente, quantas motos tem, e um botão **Trocar** |

### A busca lista quem bateu, não escolhe sozinha

A busca fazia `.find()`: digitar "jo" **já prendia a OS no primeiro João da
agenda**, sem mostrar que existiam outros três. Numa oficina isso é rotina — pai
e filho com o mesmo nome, dois Silva, a mesma pessoa cadastrada duas vezes — e a
OS acabava no nome errado, com a moto errada aparecendo para escolher.

Agora digitar **procura**; quem escolhe é a pessoa, clicando. A lista mostra
nome, WhatsApp e as placas de cada um, que é o que deixa diferenciar dois
homônimos sem abrir o cadastro dos dois. Cliente de uma moto só continua vindo
com ela já escolhida, e trocar o texto da busca desfaz a escolha anterior em vez
de deixar um cliente selecionado por baixo.

É o mesmo padrão dos três `?? clients[0]` (PRs #28, #30 e #32), agora do outro
lado: **achar não é escolher**.

O roteiro ponta a ponta cadastra "Joaquim Ribeiro" e "Joaquim Ribeiro Filho",
digita "Joaquim", confere que os **dois** aparecem e que nenhum foi escolhido
sozinho, clica no segundo — justamente o que o `.find()` nunca escolheria — e
confere no Firestore que a OS saiu no nome do filho, com a moto do filho.

**2 · Motocicleta** — fica esperando enquanto não há cliente ("Escolha o cliente
acima primeiro"). Com o cliente escolhido, mostra as motos dele para clicar, mais
"Outra moto". Cliente novo (ou "Outra moto") abre o cadastro rápido com **placa,
marca, modelo, versão, ano e cor** — marca e modelo saindo do mesmo catálogo do
cadastro completo, em vez de digitados à mão. O campo mostra "Fica gravado como:
Honda Biz 125", e a moto é gravada com a marca separada do modelo, igual ao
cadastro completo.

### O `?? clients[0]` de novo

Ao testar a tela nova, o bloco da moto mostrou as motos de **outro cliente**. A
causa era a mesma da OS encerrada errada: `selectedCustomer` caía num
`?? clients[0]` quando ninguém estava escolhido, e o bloco listava as motos do
primeiro cliente da agenda. Escolher ninguém não pode significar "o primeiro da
lista" — o fallback saiu.

## A nova OS numa tela só

O passo a passo pedia **quatro telas** para abrir uma OS que o balcão preenche
em trinta segundos: cliente e moto, avançar, recepção, avançar, itens, avançar,
conferir, confirmar. **Três dos quatro cliques eram só para chegar no campo
seguinte**, e a etapa de revisão repetia o que já estava preenchido logo acima.

Agora é uma tela só, em duas colunas:

| Coluna | O que tem |
| --- | --- |
| Esquerda | Quem responde (cliente ou parceira), a motocicleta, e a recepção — km, combustível, problema, prioridade, previsão e mecânicos |
| Direita | As peças do estoque, a mão de obra e os itens já incluídos |

O **total fica fixo no rodapé** — peças, mão de obra, desconto do parceiro e o
valor final —, à vista o tempo todo enquanto se monta a OS. Era a única coisa
que a etapa de revisão dava e que a tela única não daria sozinha.

### Uma tela só, mas ainda com moldura demais

Ser uma tela só não bastou: a tela era grande demais para caber nela mesma. Mais
da metade do espaço era moldura — não conteúdo:

| O que ocupava | Antes | Agora |
| --- | --- | --- |
| Cabeçalho do diálogo | 150px em três linhas (chapéu, título, explicação) | 47px, chapéu e título na mesma linha |
| Ícone decorativo por seção | 42px | nenhum — o título dá conta |
| Campo (input, select) | 40px | 32px no computador, 40px no celular |
| Linha de peça do estoque | 51px | 38px |
| Bloco de cliente/moto | círculo de 28px e padding de 11px | círculo de 20px e padding de 8px |

O resultado prático: **960px de conteúdo numa área de 688px** viraram 755px numa
área de 755px. Antes era preciso rolar para chegar no problema relatado, na
prioridade, na previsão e nos mecânicos — os campos que o balcão mais preenche.
Agora tudo cabe de uma vez numa tela de 1360×950.

A compactação vale **só dentro da nova OS** (`.dialog-os` no CSS); o resto do
sistema não muda. E no celular os campos voltam a 40px no `@media` de 560px:
32px é medida de mouse, o dedo não acerta. O passo 38 do roteiro ponta a ponta
mede as quatro coisas — que o conteúdo cabe sem rolar, que o cabeçalho não
passa de 60px, que o campo não passa de 34px e que a linha de peça não passa de
42px — e confere que "Problema relatado", "Mecânicos responsáveis", "Adicionar
peças" e "Adicionar mão de obra" continuam todos na tela.

### A nova OS entrou na mesma régua

Compactar não bastava: a OS continuava com o **rótulo em cima do campo**,
enquanto os quatro cadastros já tinham passado para o rótulo à esquerda. Duas
telas do mesmo sistema pedindo a mesma coisa de dois jeitos é o que faz quem
atende hesitar meio segundo em cada campo.

Agora a OS usa a mesma régua, com uma diferença: a coluna do rótulo é de
**104px** e não 122px, porque a OS já divide a tela em duas colunas e dentro de
cada uma o campo precisa do espaço que sobra.

Uma exceção de propósito: o **formulário da moto nova** tem três colunas de
campo curto (placa, marca, modelo, versão, ano, cor). Ali a régua não cabe — o
campo ficaria com 60px — e o rótulo continua em cima. No celular a régua toda
volta a empilhar, como nos outros cadastros.

Os rótulos encolheram junto: "Problema relatado pelo cliente" virou "Problema
relatado", "Preço cobrado da peça" virou "Preço da peça".

O diálogo desceu de 859px para **799px** de altura com isso, e o passo 38 do
roteiro passou a cobrar também a régua — que o rótulo está ao lado do campo e
alinhado à direita, além do que já media.

## A lista de peças

Era um cartão por peça, com o nome e pouco mais: para conferir o código, a
localização na prateleira ou o código de barras era preciso **abrir o cadastro
de cada uma**.

Agora é uma linha por peça, com **código, referência de fábrica, código de
barras, descrição, grupo, localização, preço, saldo e unidade** — e a busca acha
por qualquer um deles, porque é por qualquer um deles que a peça é pedida no
balcão. O preço, que é o que mais se olha, fica em destaque; o saldo carrega a
bolinha de normal, crítico ou zerado.

A linha é baixa de propósito: `td { height: 58px }` cabia oito peças na tela, e
esta lista é para varrer com o olho. Com 34px cabem vinte.

Também entraram o **filtro por grupo** ("todos os óleos"), o botão **Limpar** —
sem ele o filtro fica preso e a peça seguinte "some" do sistema para quem não
percebeu que havia busca ativa — e a **contagem de registros**, que acompanha o
filtro.

## O mecânico que não aparecia na OS

O sistema tem duas telas que parecem "cadastrar uma pessoa":

| Tela | Coleção | Para que serve |
| --- | --- | --- |
| **Funcionários** | `employees` | Quem trabalha na oficina: é daqui que sai a lista de mecânicos da OS, a comissão e o "minhas OS" do mecânico |
| **Usuários e acessos** | `users` / `userAccess` | A conta de login, o cargo e as permissões |

Cadastrar alguém como Mecânico **só em "Usuários e acessos"** criava uma pessoa
que entra no sistema mas **não existe para a oficina**: não aparecia no seletor
de mecânicos da OS, não recebia serviço e não entrava em comissão. E nada
avisava — o seletor simplesmente não tinha aquele nome.

Agora:

- A tela de Usuários **aponta** quem está assim, com o efeito escrito ("não
  aparece na abertura de OS"), e resolve com **um clique**;
- Mecânico **novo já nasce** com cadastro de funcionário;
- O vínculo volta para a conta, gravado direto no perfil — sem ele, o próximo
  carregamento casaria pelo nome outra vez e criaria um segundo cadastro da
  mesma pessoa.

As regras ficam em `src/team-link.ts`, e `npm run check:team-link` confere as 22.

### A tela de Usuários ficava vazia quando o backend administrativo falhava

Encontrado ao testar o item acima. `callAdmin` só caía no plano B — ler os
perfis direto do Firestore — para três códigos de erro. Uma resposta que **não
é o JSON esperado** (a função não subiu, um proxy devolveu uma página de erro,
o ambiente serve o index.html em qualquer rota) virava "erro interno", o plano
B não era usado, e a tela mostrava **"Nenhum usuário encontrado"** — como se as
contas tivessem sumido.

Resposta que não é o JSON da API administrativa, e erro 5xx, passaram a contar
como indisponibilidade. A tela mostra o que consegue ler e diz por quê.

## Configurações sem precisar ser Super Admin

A Rayane foi cadastrada como Balcão e parou de conseguir abrir as
Configurações. Não era engano de marcação: **não existia permissão nenhuma para
essa tela**. Ela era liberada só para Super Admin, no código — e quem precisava
mexer numa categoria tinha de virar Super Admin, o que dá junto o poder de
criar usuário e mudar a permissão dos outros.

Entraram quatro permissões novas, marcáveis na tela:

| Permissão | O que libera |
| --- | --- |
| `settings.view` | Abrir as Configurações (vem por padrão no Balcão) |
| `settings.manage` | Criar e editar categorias, marcas, parceiras, formas de pagamento |
| `team.view` | Ver a equipe (já existia) |
| `team.manage` | Cadastrar e editar funcionários |

**Ver e alterar são separados**: quem atende precisa consultar categoria e
forma de pagamento o tempo todo; alterar é decisão do dono, marcada na tela.
Criar usuário e mexer na permissão dos outros continua só no Admin.

As `firestore.rules` acompanharam: `categories`, `quickServices`, `partners`,
`paymentMethods`, `paymentMachines`, `settings` e `employees` deixaram de exigir
`isSuperAdmin()`. Salário e comissão (`employeeCompensation`) continuam só de
Super Admin.

`npm run check:permissions` agora **lê o `firestore.rules`** e cobra que toda
permissão citada lá exista na lista do sistema — foi essa desconexão entre tela
e regra que prendeu as Configurações em Super Admin sem ninguém notar.

## Histórico do cliente e da moto

Com a moto no portão a pergunta é sempre a mesma: **o que já foi feito nela, e
quando?**. A resposta estava só no caderno — e sem ela o mecânico refaz serviço
que ainda está na garantia, e ninguém lembra que a relação foi trocada mês
passado.

O histórico sai das ordens de serviço que já existem: não é cadastro novo para
alguém manter. Aparece em dois lugares, com a mesma tela:

- **Na nova OS**, atrás de **"Ver histórico"** — fechado por padrão, porque quem
  abre OS o dia inteiro não quer rolar dez atendimentos antigos antes de digitar
  a placa. O cabeçalho do cliente já diz quantos atendimentos ele tem.
- **Na aba Clientes e na de Motocicletas**, no botão **Histórico** de cada linha,
  que abre um de cada vez.

Cada linha traz data, o que foi feito, a moto, o valor e se já foi entregue.
Em cima: quantos atendimentos, quanto o cliente já gastou e a última visita.

O "já gastou" conta **só OS entregue**: o que ainda está na bancada pode mudar
de valor até a entrega, e somar isso mentiria sobre o cliente.

`clientHistory` junta pelo id do cliente **e** pelas placas das motos dele — OS
antiga, aberta antes de o cadastro existir, guarda a placa e não o id, e é
justamente essa que o balcão quer ver. `npm run check:history` confere as 22
regras, incluindo a ordenação: data brasileira ordenada como texto coloca 02/01
depois de 28/06, e um histórico embaralhado é pior do que nenhum, porque parece
certo.

## Procurar pela placa

A moto chega no portão e o balcão lê a **placa** — ninguém pergunta o nome antes.
A busca da nova OS e a da aba Clientes agora acham pela placa, com ou sem hífen,
maiúscula ou minúscula. Achando pela placa, **a moto já vem escolhida** na OS:
um cliente com quatro motos, sem isso, obrigaria a procurar a placa outra vez no
bloco 2.

Encontrado ao testar: digitar `TES1D23` virava `(12) 3` na tela. O campo
formatava como telefone qualquer coisa que tivesse dígito, e a placa nunca
achava nada. Telefone é o que é **só número**; o que tem letra é placa ou nome.

## Todo cadastro em maiúsculo

O mesmo produto entrava três vezes escrito de três jeitos — "Óleo 20W50",
"oleo 20w50", "ÓLEO 20W50". A busca do balcão não achava, o relatório contava
como três produtos e o estoque nunca fechava.

Cliente, peça, moto, fornecedor, funcionário e os cadastros rápidos de dentro da
OS agora entram **em maiúsculo já na digitação**, com `toLocaleUpperCase("pt-BR")`
— que é o que mantém "manutenção" virando "MANUTENÇÃO" com o cedilha e o til nos
lugares certos.

Ficam de fora **e-mail e senha**: e-mail é o que a pessoa usa para entrar no
sistema.

`npm run check:text-case` não confere só a regra: **varre os cinco formulários de
cadastro** procurando campo de texto que grave sem passar pelo maiúsculo. Sem
isso, o próximo campo adicionado a qualquer um deles entraria minúsculo em
silêncio, e só se descobriria meses depois com o cadastro já sujo.

## Cadastro de moto: marca, modelo e versão

O modelo era um campo de texto livre. A mesma moto entrava como "CG 160 Fan",
"cg160 fan", "CG FAN 160" e "Honda CG 160" — e aí o histórico da moto, a busca
por modelo e qualquer contagem de "quais motos mais atendemos" param de
funcionar.

`src/motorcycle-catalog.ts` traz o que roda em oficina de bairro no Brasil:
**16 marcas, 117 modelos e 282 versões** — Honda, Yamaha, Suzuki, Kawasaki,
Haojue, Dafra, Shineray, Traxx, Kasinski, Sundown, Royal Enfield, BMW, Triumph,
Harley-Davidson, KTM e Ducati. Escolher a marca troca a lista de modelos;
escolher o modelo troca a de versões.

A Honda vai da CG 125 à Africa Twin, passando por **CG 150** (Titan, Titan KS,
Titan ES, Titan EX, Titan Mix, Sport, Fan, Fan ESI, Job, ESD), CG 160, Biz, Pop,
NXR Bros, XRE, XLR, CBX, CB, NX, XR, PCX, Lead, Elite, ADV, SH, Shadow e Dream.

Não é exaustivo de propósito: quem tiver uma moto fora da lista escolhe "Outro"
e digita, e o texto vai gravado igual. O que fica no banco continua sendo um
campo só — "CG 160 Fan" —, que é o que a OS imprime e o que a busca procura.
Moto cadastrada antes disto abre com as listas já na escolha certa
(`splitModelName` separa o texto gravado de volta em modelo e versão).

`npm run check:motorcycle-catalog` confere as 26 regras, incluindo uma que já
pegou um defeito: **toda marca do catálogo precisa estar na lista de marcas do
cadastro**, senão a pessoa escolhe a marca e não aparece modelo nenhum.

## A nota do fornecedor entra por XML

Cadastrar peça a peça depois de cada compra é o que ninguém faz: a nota chega
com trinta itens e o estoque do sistema fica meses atrás do estoque da
prateleira.

O **XML da NF-e** já traz tudo — código, código de barras, descrição, unidade,
quantidade e o **custo real pago** — e vem junto com a compra, **de graça**, sem
depender de banco de dados de terceiro (que, para peça de moto, acerta pouco e
cobra caro).

Sobe o arquivo e o sistema mostra, item por item, **antes de gravar qualquer
coisa**:

| Coluna | O que responde |
| --- | --- |
| Situação | "Já cadastrada" — e **como** foi achada — ou "Cadastrar esta peça" |
| Nota | O que está escrito na nota: `2 CX` |
| Un. por volume | O fator, **editável** |
| Entra no estoque | `2 × 12 = 24` |
| Custo antes / agora | R$ 25,00 → R$ 30,00 |
| Variação | **+20%**, em vermelho quando sobe e verde quando cai |

### O fator de conversão é o coração disso

A nota diz **"1 CX"** e na prateleira entram **6**. Sem tratar isso:

- o estoque entra com 1, e a peça "acaba" no sistema com cinco ainda na caixa;
- o **custo unitário fica seis vezes maior**, e o preço de venda sai pela lua.

O sistema **chuta** o número lendo a descrição — "CX C/ 12", "CAIXA COM 6",
"EMB. 24", "20X1L" — mas é palpite, e a tela deixa corrigir. Fator zero ou
negativo é **recusado com aviso**, em vez de virar 1 em silêncio: entrar com a
quantidade da nota escondendo que o número está errado é pior do que não entrar
com nada.

### Os cuidados que evitam estoque errado

- **"SEM GTIN"** — o que a Receita manda escrever quando a peça não tem código
  de barras — **não** vira código: tratá-lo como código casaria peças
  diferentes entre si.
- O casamento vai na ordem em que dá para confiar: **código de barras**
  (exato), **referência de fábrica** (quase), e **descrição** só quando é
  idêntica. Casar "ÓLEO 20W50" com "ÓLEO 20W50 SEMISSINTÉTICO" somaria a
  entrada no produto errado, e ninguém perceberia até o estoque não fechar.
- Peça nova **não nasce com saldo**: o saldo entra pela baixa, senão conta duas
  vezes.
- O leitor de XML é escrito à mão, **sem depender do navegador**: o mesmo
  código lê a nota na tela, no `npm run check:nfe` e, se um dia a leitura for
  para o servidor, lá também — e o que o teste cobre é o que roda para o dono
  da oficina.

`npm run check:nfe` confere as 45 regras.

## Criar categoria e marca do lado do campo

Cadastrar uma peça e descobrir que a categoria dela não existe obrigava a
**fechar o cadastro, ir em Configurações, criar a categoria, voltar e digitar
tudo de novo**. Na prática ninguém faz isso: joga em "Peças" e segue — e aí o
filtro do estoque para de significar alguma coisa.

O botão **+** ao lado do campo abre um espaço na mesma linha; ao confirmar, o
item é criado, já fica selecionado, e o cadastro continua de onde estava. Vale
para a **categoria** e a **marca da peça**, e para a **marca da moto** (no
cadastro de moto e no bloco de moto do cadastro de cliente).

Nome repetido **não vira item novo**: a busca é sem depender de maiúscula, e o
que já existe é selecionado. Sem isso a lista encheria de "MOTUL", "Motul" e
"motul " — o problema que a própria lista veio resolver. Enter confirma e
**não envia o formulário**: sem esse cuidado, apertar Enter aqui gravava o
produto pela metade.

## O cadastro de peça no formato do balcão

A referência é o cadastro de produto do **White PDV**, o sistema que a oficina
usa todo dia. Duas coisas o definem, e as duas eram o oposto do que estava aqui.

**Cinco etapas viraram uma tela.** O cadastro pedia "Próxima etapa" quatro vezes
— identificação, preços, estoque, compatibilidade, fornecedor — para uma peça
que se cadastra em vinte segundos, e três dos quatro cliques só serviam para
chegar no campo seguinte. Agora é uma aba só. A movimentação continua em aba
própria: é leitura, não etapa do cadastro.

**O rótulo foi para a esquerda do campo.** Empilhado em cima, cada campo gastava
duas linhas; ao lado, a coluna de rótulos vira uma régua que o olho desce sem
reler. É o que permite o cadastro inteiro caber numa tela de 1360×950 sem rolar.

| Antes | Agora |
| --- | --- |
| 6 abas, 4 cliques de "Próxima etapa" | 2 abas, nenhum clique de etapa |
| Rótulo empilhado sobre o campo | Rótulo à esquerda, alinhado à direita |
| Campo de 40px | 28px no computador, 40px no celular |
| Números misturados com o resto | Três colunas: **Preço**, **Estoque**, **Resultado** |
| Marcações espalhadas pelas etapas | Painel **Parâmetros** à direita |
| "Cancelar" e "Cadastrar Produto" | `Esc` Cancelar · `F5` Salvar, com o atalho ligado |

A coluna **Resultado** é leitura, não campo — margem sobre a venda, lucro por
unidade, desconto máximo e piso sem prejuízo. Ela não parece digitável de
propósito: é o que sai da conta, não o que se informa.

O que a referência não tem e o sistema manteve: o histórico de movimentação da
peça, o botão de gerar código de barras interno, criar categoria e marca sem
sair do cadastro, e o aviso de preço abaixo do custo.

### Cliente, moto e fornecedor no mesmo formato

Os outros três cadastros seguiram o mesmo caminho. Cliente e fornecedor tinham
**cinco abas de etapa** cada um; agora as abas viraram títulos de bloco dentro
de uma tela só, com a mesma régua de rótulos:

| Cadastro | Antes | Agora |
| --- | --- | --- |
| **Cliente** | 5 abas: Dados Pessoais, Contato, Endereço, Financeiro, Observações | Uma tela com esses cinco blocos |
| **Fornecedor** | 5 abas: Identificação, Contato, Comercial, Endereço, Observações | Uma tela com esses cinco blocos |
| **Motocicleta** | Já era uma tela | A mesma tela, agora com a régua |

A régua não custou uma reescrita campo a campo: os quatro formulários já usavam
o mesmo par `field-group` / `field-label`, que tem exatamente a forma
rótulo-e-campo. Uma regra de CSS sob `.pdv-form` transforma esse par nas duas
colunas, e os agrupadores de duas e três colunas viram `display: contents` para
que cada campo ocupe a sua linha. O JSX só mudou onde havia etapa de verdade.

Os rótulos encolheram junto, porque a régua só funciona quando o rótulo cabe em
uma linha: "Endereço Completo (Rua, Número, Bairro, Cidade)" virou "Endereço",
"Nome Completo / Razão Social" virou "Nome / Razão social", "WhatsApp /
Telefone Principal" virou "WhatsApp".

### O `required` do navegador entrou na frente

Achado ao juntar as etapas: enquanto o cadastro tinha abas, o campo obrigatório
da aba seguinte **nem estava na tela**, então o `required` do HTML nunca barrava
nada e a conferência era sempre a nossa. Numa tela só ele passa a barrar — e o
balão do navegador entra na frente da mensagem escrita **dentro** do formulário,
que é justamente a que diz o que a oficina precisa saber ("toda pessoa cadastrada
precisa de pelo menos uma moto vinculada").

Os quatro formulários ganharam `noValidate`. A conferência continua sendo a
nossa, com a mensagem no lugar onde o projeto já tinha decidido que ela fica —
depois de o aviso ter sido um toast que aparecia **atrás** do modal.

### Os atalhos são de verdade

`F5` grava e `Esc` fecha, como no sistema de origem. O atalho está escrito no
botão, então precisa funcionar — um rótulo "F5" que não faz nada é pior que não
ter rótulo. F5 é o refresh do navegador, e por isso o atalho é ligado **só
enquanto o cadastro está aberto**: fechou, F5 volta a recarregar a página (e
Ctrl+R continua funcionando mesmo com o cadastro aberto). F5 dispara o mesmo
submit do botão, para passar pela conferência dos campos obrigatórios em vez de
gravar por fora dela.

### O defeito do clique duplo deixou de existir

O assistente trazia junto o defeito que ele mesmo criava: o mesmo canto da tela
trocava de botão entre "Próxima etapa" e "Cadastrar Produto", então um clique
duplo — que é o que se faz num botão que parece não ter respondido — avançava e
gravava a peça pela metade. Sem etapas, o problema some pela estrutura.

O gesto continua existindo, então o roteiro passou a cobrar o que importa agora:
**clique duplo no botão de gravar não pode cadastrar a mesma peça duas vezes**.
O passo 18 também confere que não voltaram "Anterior" e "Próxima etapa", que o
rótulo está ao lado do campo e alinhado à direita, que os números estão em três
colunas, que o painel de parâmetros existe e que o formulário inteiro cabe sem
rolar.

No celular a régua não cabe: abaixo de 720px o rótulo volta para cima do campo e
o campo volta a 40px — 28px é medida de mouse.

## Dinheiro e porcentagem com as casas: 0,00

Todo campo de valor e de porcentagem mostra as duas casas com vírgula — "2,68",
"0,00", "51,27" — como no sistema de referência. Antes eram `input[type=number]`
mostrando "5" e "2.68": esse tipo de campo **não exibe vírgula**, e num sistema
de oficina brasileira "2.68" é o que faz alguém digitar o ponto e o valor entrar
errado. Pior, "5" num campo de dinheiro obriga quem confere a adivinhar se é
cinco reais ou cinco centavos, e uma coluna de valores com quantidade de dígitos
variável não dá para somar de cabeça.

Quantidade continua inteira — estoque, dias, minutos, parcelas —, também como na
referência. Casa decimal em contagem de peça é ruído.

São dois caminhos, porque o sistema guarda valor de dois jeitos:

| Campo | Componente | Onde |
| --- | --- | --- |
| Guarda **número** | `NumberField casas={2}` | Cadastro de peça, cliente, funcionário, fornecedor, Configurações |
| Guarda **texto** | `MoneyField` | Mão de obra da OS, serviço rápido, gasto, conta, caixa, troca |

O segundo existe porque essas telas guardam o que foi digitado como string e
liam com `Number(texto)`. Isso funcionava só enquanto o campo mostrava "40":
assim que ele passa a mostrar "40,00", `Number("40,00")` vira **NaN** e o valor
some da conta. Quem lê passou a usar `valorDigitado`, que entende a vírgula.

### O centavo que sumia

`(2.675).toFixed(2)` devolve **"2,67"**. Não é bug do JavaScript: o double mais
próximo de 2,675 é um pouquinho *menor* que 2,675, então arredondar para baixo
está certo do ponto de vista da máquina — e errado do ponto de vista de quem põe
o preço na peça. Um centavo por peça, em toda entrada de nota, vira diferença no
fechamento que ninguém consegue explicar.

`arredondar()` desloca a vírgula pelo **texto** ("2.675" → "2.675e2" → 267,5),
onde o meio-termo existe de verdade e o arredondamento acontece como no papel.

E o valor sobe arredondado, não só *escrito* arredondado: digitar 2,675 no custo
mostrava "2,68" e guardava 2,675, então o preço calculado saía de um custo que
não era o que estava na tela — 4,28 em vez de 4,29. Agora o que se vê é o que
fica gravado.

`npm run check:number-input` cobre as duas coisas em 53 casos.

## O preço mostra a conta que decide a venda

A tela mostrava custo, margem e preço. Faltava o que decide se a venda vale a
pena:

| O que entrou | Por quê |
| --- | --- |
| **Margem sobre a venda** | O campo "Margem s/ custo (%)" é margem sobre o **custo**: custo 25 vira preço 40. Sobre a venda isso é **37,5%** — e é essa a porcentagem que se compara com a do cartão e a do concorrente. Ver só o número maior faz a oficina achar que ganha mais do que ganha. Por isso os dois rótulos dizem sobre o quê a margem é |
| **Desconto máximo sem prejuízo** | O PDV deixa descontar. Sem saber o piso, o desconto "de bom moço" vende abaixo do que se pagou ao fornecedor |
| **Aviso de preço** | Abaixo do custo, igual ao custo, ou margem abaixo de 10% sobre a venda |

`npm run check:pricing` confere as 29 regras das duas coisas.

### A primeira categoria apagava as outras nove

Encontrado ao testar a criação rápida. A oficina que ainda não cadastrou
categoria nenhuma vê as **nove padrão** — elas não são documentos, são o texto
que aparece enquanto a coleção está vazia. Gravar só a categoria nova fazia a
coleção deixar de estar vazia, e as outras nove **sumirem da tela de uma vez**:
a oficina passava a ter uma categoria só.

Agora a primeira criação **materializa as padrão junto**: elas viram cadastro de
verdade, editável em Configurações, e nada desaparece.

### O roteiro passou a rodar contra o build

Quatro rodadas seguidas falharam do passo 27 em diante sem nada de errado no
código. A causa era o **servidor de desenvolvimento**: ele disparava HMR sozinho
a cada ~15 minutos, e uma rodada leva ~15 minutos — então toda rodada levava um
recarregamento no meio, que zerava o estado da tela em que o teste estava.

O `npm run e2e:emulador` agora roda contra `npm run preview:emulador`, que serve
o **build**. Sem HMR, e exercitando o artefato que vai para produção em vez do
servidor de desenvolvimento.

## As Configurações viraram um menu, não oito pílulas

Eram **oito abas em pílulas** que quebravam a linha no topo. Para achar onde se
muda a margem padrão era preciso abrir uma por uma — e quem não sabia o nome da
aba não achava nunca, porque a margem mora em "Estoque e reposição", nome que
ninguém adivinha.

Agora é um **menu lateral fixo**, com três coisas que a lista de pílulas não
dava:

1. **O que cada seção resolve**, escrito embaixo do nome. "Pagamentos e taxas —
   formas de pagamento, máquinas de cartão e a taxa de cada bandeira."
2. **Quantos itens cada seção já tem.** Seção vazia é o que a oficina precisa
   ver de longe: sem forma de pagamento cadastrada, o PDV não recebe.
3. **Busca pelas palavras da oficina.** "margem" leva ao estoque, "maquininha"
   aos pagamentos, "frota" às parceiras.

A busca casa **palavra por palavra** e ignora as ligações: "taxa **do** cartão"
acha, em vez de reprovar por causa do "do". E ignora acento, porque ninguém
digita "combustível" com acento no meio do atendimento.

Quando a busca deixa de mostrar a seção aberta, a tela abre a primeira que
sobrou — senão o conteúdo à direita ficaria órfão, mostrando o que não está
mais no menu.

O mapa fica em `src/settings-map.ts`, e `npm run check:settings-map` confere as
27 regras — incluindo uma que compara o mapa com as abas que a tela realmente
tem: **seção no mapa que a tela não tem vira item de menu que não abre nada, e
aba na tela que não está no mapa vira seção que a busca nunca acha**.

## O botão de ajuda que não ajudava

"Precisa de ajuda?" abria um aviso e mais nada. Ajuda que não responde é pior
do que não ter: a pessoa clica, não acha, e não clica de novo.

Agora ele abre uma central com **sete assuntos**, escritos para quem toca a
oficina e não para quem programa: abrir e fechar uma OS, como o preço é
formado, estoque e entrada de peças, caixa, empresa parceira, quem pode fazer o
quê, e backup.

Cada assunto tem os passos na ordem em que a coisa acontece e um botão que
**leva para a tela que resolve**, em vez de só explicar. A busca é por
intenção — digitar "sangria" acha o caixa, "desconto" acha o preço.

O conteúdo fica em `src/help-topics.ts`, e `npm run check:help` cobra que todo
assunto tenha título, resumo, pelo menos três passos com explicação de verdade,
e que **aponte para uma aba que existe**: ajuda que manda para lugar nenhum é
exatamente o que ela deveria evitar.

## Código de barras de peça sem código

Nem toda peça vem com código de fábrica — adesivo, parafuso avulso, peça usada.
Sem código, a leitora não serve e a venda volta a ser digitada à mão, que é onde
o erro entra.

O botão **Gerar**, ao lado do campo de código de barras, cria um EAN-13 válido.
O padrão GS1 reserva os prefixos 20 a 29 para código de **circulação restrita**:
vale dentro do estabelecimento e não conflita com nenhum produto de fabricante
do mundo. Por isso o gerado começa com 2.

Antes de devolver, o gerador confere se o código já está em uso no estoque —
sortear sem olhar é o caminho para duas peças com o mesmo código, e aí a leitora
traz a errada no balcão. O campo também avisa quando o código digitado à mão não
passa na conferência do dígito verificador.

`npm run check:barcode` confere as 24 regras: o dígito verificador contra EANs
reais conhecidos, a recusa de código com um dígito trocado, e que o sorteio nos
extremos (0 e 1) continua gerando código válido de 13 dígitos.

## Empresa parceira

A oficina atende frotas — aplicativo de entrega, locadora, transportadora. A
moto entra, a peça sai do estoque e o serviço é feito no dia; **o dinheiro só
vem na fatura do mês seguinte**. Tratar isso como venda à vista mentia duas
vezes: dizia que entrou dinheiro que não entrou, e o caixa do dia fechava com
quebra.

### A parceira é escolhida junto com o cliente

Quem abre a OS da frota já sabe de quem é a moto antes de digitar qualquer coisa.
Por isso o bloco **1 · Cliente** passou a ter duas opções lado a lado:

| Escolha | O que aparece no bloco 2 |
| --- | --- |
| **Cliente** | A busca por nome ou WhatsApp, como antes |
| **Empresa parceira** | A lista de parceiras ativas e, abaixo, as motos daquela frota |

Com a parceira escolhida, o bloco da moto mostra **as motos dela**, com busca por
placa ou modelo — frota tem dezenas de motos, e rolar um `<select>` com cinquenta
placas não é escolher, é procurar. "Outra moto" abre o cadastro por cima da OS já
com a parceira preenchida como responsável.

### Moto de frota não tem dono, tem responsável

As motos que ficam com a oficina em nome do parceiro **são cadastradas sem dono
individual**: ninguém é o proprietário, a empresa é a responsável. O cadastro de
moto ganhou o campo **"Empresa parceira responsável"**, e o dono virou opcional
("Sem dono individual"). No banco a moto guarda `partnerId` e `partnerName`, e
nenhum `ownerId`.

Isso é o que permite cadastrar de uma vez toda a frota que está na oficina sem
inventar um cliente para cada moto — e é conferido no roteiro ponta a ponta, que
verifica no Firestore que a moto ficou sem dono e que **nenhum cliente foi
criado** ao abrir a OS da frota.

### A busca acha a moto pela placa, e acha a que já está no sistema

Dois defeitos que a oficina encontrou usando o sistema, os dois reproduzidos
antes de mexer em qualquer linha:

**A placa é gravada com hífen ("FLA-2C34"), e a busca comparava o texto cru.**
Quem digita "FLA2" — que é como se digita placa com pressa — não achava a moto
que estava ali, na frota, na lista logo abaixo. Agora a placa é comparada
normalizada dos dois lados, então "FLA2", "fla-2c34" e "FLA 2C34" acham a mesma
moto.

**Uma moto que já existe no sistema em nome de um cliente não aparecia.** A
busca só olhava as motos com `partnerId` da parceira escolhida, e é o caso comum
— a oficina já atendeu aquela moto como cliente direto antes de ela passar a
rodar para a parceira. Sem achá-la, o caminho que sobrava era cadastrar a mesma
placa outra vez, o que parte o histórico da moto em dois.

A busca agora devolve **dois grupos separados**, nunca uma lista só:

| Grupo | O que traz |
| --- | --- |
| **Frota da _parceira_** | As motos que têm essa empresa como responsável |
| **Já no sistema, fora desta frota** | Qualquer outra moto que bateu com a busca, com o nome do dono ao lado |

Os grupos ficam separados de propósito: puxar a moto de um cliente para uma OS
da parceira é legítimo — a moto está lá, quem paga é a parceira —, mas quem
atende precisa ver de onde ela veio antes de salvar. Escolher uma moto de fora
mostra um aviso dizendo de quem ela é, e **incluir a moto na frota é um botão à
parte, nunca automático**: mover a moto de um cliente para a frota é uma decisão
do atendente, não um efeito colateral de escolher a moto. O dono continua sendo
o dono depois disso — a moto passou a rodar para a parceira, não mudou de
pessoa.

A conta é de `src/fleet.ts` (`npm run check:fleet`, 35 casos) e o passo 37 do
roteiro ponta a ponta refaz o caminho inteiro no navegador, incluindo a
conferência no Firestore de que o botão gravou a parceira e não mexeu no dono.

### A etapa "Origem" saiu

A OS tinha uma etapa só para perguntar de onde veio a moto e quem a trouxe. Com
a parceira escolhida logo na etapa 1, a pergunta já está respondida antes de
chegar lá: a etapa era um clique em "Próxima" toda vez.

A OS passou de **5 para 4 etapas** — Cliente e moto, Recepção, Itens, Revisão —
e os campos de entregador e contato saíram junto.

#### A lista da frota vinha vazia

Ao testar, escolher a parceira mostrava "nenhuma moto" mesmo com a frota
cadastrada. O `useState` inicial era `partners[0]?.id ?? ""`, avaliado **antes de
o Firestore responder**: o estado ficava em `""` para sempre enquanto o `<select>`
exibia a primeira parceira. A tela dizia uma coisa e o filtro procurava outra.
A filtragem passou a usar a parceira que está de fato selecionada, e o id é
gravado ao entrar no modo parceira.

#### O terceiro `clients[0]`

Ao testar isto, a moto cadastrada pela tela da parceira apareceu **no nome de
outro cliente**. O formulário de moto fazia
`setOwnerId(preselectedClientId || clients[0]?.id)`: sem dono escolhido, a moto
ia para o primeiro cliente da agenda — alguém que nunca foi dono dela, e que
passava a ver essa moto na própria lista ao abrir uma OS.

É o mesmo padrão que já tinha derrubado a OS encerrada errada (PR #28) e a lista
de motos do bloco do cliente (PR #30). Não escolher nada nunca pode significar
"o primeiro da lista": o `|| clients[0]` saiu, e o campo fica em "Selecione o
cliente proprietário".

Escolher a empresa parceira marca a empresa como responsável pelo pagamento —
era um `<select>` com `defaultValue`, sem estado e sem ninguém lendo: escolher
"Empresa parceira" não mudava nada, e a OS da frota era cobrada do motoboy que
trouxe a moto.

No encerramento, a OS faturada **não pergunta forma de pagamento**. Mostra o que
vai para a fatura, com o desconto combinado aplicado **só na mão de obra** —
peça tem preço fixo, dar desconto nela seria vender abaixo do que a oficina
pagou ao fornecedor —, e diz o vencimento.

O valor vira conta a receber **no nome da empresa**, com vencimento no dia 1º do
mês seguinte. A baixa do estoque acontece normalmente, como em qualquer OS.

Por dentro, a forma de pagamento gravada é `Faturado no parceiro`, reconhecida
como pagamento a prazo pelo resto do sistema: não conta como faturamento
recebido, não entra na gaveta do caixa, e aparece em Contas a receber — tudo
pelo caminho que já existia para a nota a prazo.

`npm run check:partner` confere as 30 regras: o desconto sobre a mão de obra
(inclusive 0%, 100%, negativo e acima de 100), o vencimento (virada de mês, de
ano, último dia do mês) e que o dinheiro não entra na gaveta.

### O id da OS se perdia no caminho do recebimento

Encontrado ao testar isto com **mais de uma OS na lista**. Ao ir do detalhe da
OS para a tela de receber, o id não era repassado: `openDialog` limpava o
registro selecionado e o `currentOrder` caía num `?? orders[0]`.

O resultado: o recebimento era gravado na **primeira OS da lista**. A ordem
errada era encerrada, com os itens e o total da outra, e a certa continuava
aberta. Com uma OS só nada aparecia — que é por que passou até agora.

O id passou a ir junto, e o encerramento recusa gravar quando a OS não é a
selecionada, em vez de encerrar a errada em silêncio. O roteiro ponta a ponta
confere que a OS do passo 6 continua com os seus R$ 150 em dinheiro depois de a
OS da parceira ser encerrada.

## O tamanho da letra

A oficina estava dando **zoom no navegador** para conseguir ler o sistema. A
causa era minha: ao compactar as telas para o formato do sistema de balcão, eu
encolhi a letra junto — e densidade se faz com **espaçamento apertado, não com
letra microscópica**.

A folha de estilo tinha 364 declarações de `font-size` em 9px ou menos:

| Tamanho | Quantas | Onde ficava |
| --- | --- | --- |
| 6px | 12 | Legendas de cartão |
| 7px | 98 | Sublinha de lista, código da peça, dica de campo |
| 8px | 141 | Rótulo pequeno, descrição de bloco, valor secundário |
| 9px | 113 | Rótulo de campo, texto de tabela |

7px é metade do tamanho que um sistema desktop usa para texto de apoio. Não é
"compacto", é ilegível.

A escala inteira subiu, preservando a hierarquia — 6→10, 7→10,5, 8→11,5, 9→12,
10→13, 11→14, e assim por diante até os títulos. Nada abaixo de **10px**, e o
texto que se lê o dia todo (rótulo de campo, linha de tabela) ficou em **12 a
13px**.

O espaçamento **não** mudou: as telas continuam com o mesmo aperto que ganharam
no formato do balcão. O que mudou foi só o tamanho do que está escrito dentro
delas.

### O que precisou de ajuste junto

Com o texto 30% maior, três coisas encostaram:

- **A coluna de rótulos da régua** passou de 122px para 150px nos cadastros e de
  104px para 126px na OS — rótulos de duas palavras estavam quebrando em duas
  linhas.
- **O cadastro de peça** ficou 100px mais largo (940 → 1040px), porque as três
  colunas de números apertavam "Margem s/ custo (%)" contra a caixa do valor.
- **O cartão da oficina no painel administrativo**, no celular, quebrava o nome
  em três linhas ("Pica / Pau / Motos"): o botão "Editar dados" disputava a
  linha com o texto. Agora o texto fica com a largura toda e o botão vai para
  baixo.

Conferido a 1440×900 e a 390×844: nenhuma rolagem lateral, nenhum botão ou
rótulo cortado, nenhum rótulo em duas linhas nas telas da régua, e a nova OS e o
cadastro de peça continuam cabendo inteiros sem rolar.

## Responsividade

O que foi conferido, renderizando cada tela em 360, 768 e 1440px: **18 telas e
19 diálogos**, procurando queda, tela branca e elemento fora da área visível.

- **Modais de cadastro**: os cinco formulários (produto, cliente, moto,
  fornecedor, funcionário) usavam 30 classes que nunca existiram no
  `globals.css` — apareciam sem janela, sem fundo e com o rótulo colado no
  campo. Agora reaproveitam os mesmos valores do diálogo principal. No celular
  ocupam a tela inteira, as grades de 2/3/4 colunas viram uma, e as abas rolam
  na horizontal.
- **Tabelas**: continuam roláveis, mas as colunas marcadas com `.col-secondary`
  somem abaixo de 560px. Fica o que identifica a linha, o dinheiro, a situação
  e a ação; sai o contexto (categoria, responsável, data de entrada, descrição).
  Nada se perde — abrir o registro mostra tudo.

## Excluir cadastro sem apagar a história

Os cadastros principais — **produto, cliente, moto, fornecedor e funcionário** —
não tinham exclusão nenhuma: dava para editar e nunca remover. Quem digitou o
nome errado, cadastrou a mesma peça duas vezes ou criou um cliente de teste
ficava com o lixo na lista para sempre. (Usuário de acesso e os itens das
Configurações — serviço rápido, categoria, forma de pagamento, maquininha e
parceiro — já tinham.)

Mas **apagar de verdade só é seguro quando o cadastro nunca foi usado**. Um
produto que já foi vendido, um cliente que já tem OS, uma moto que já passou
pela bancada: apagar esses não limpa nada, quebra. A OS antiga passa a apontar
para um produto que não existe, o relatório do mês muda sozinho, e o custo médio
da peça perde a origem. Nada disso dá erro na hora — só aparece semanas depois,
quando ninguém mais liga uma coisa à outra.

Então são **dois caminhos**, e a tela diz qual dos dois vai acontecer **antes**
de confirmar:

| Situação | O que acontece | O botão diz |
| --- | --- | --- |
| Nenhum vínculo | O documento sai do banco | **Apagar de vez** |
| Tem vínculo | Fica gravado como inativo | **Desativar cadastro** |

A confirmação não é um "Tem certeza?" genérico: ela lista **onde** o cadastro
aparece — "1 venda no balcão, 2 entradas de estoque" — porque a diferença entre
sumir do banco e ficar inativo é a diferença entre perder e não perder o
histórico da oficina.

### O que segura cada cadastro

| Cadastro | Vínculos que impedem apagar |
| --- | --- |
| **Produto** | Item de OS, venda no balcão, entrada de estoque |
| **Cliente** | OS, venda, conta a receber, e as motos no nome dele |
| **Moto** | OS pelo id **ou pela placa** — a OS aberta sem cadastro de moto prende do mesmo jeito, e é a que ninguém lembra |
| **Fornecedor** | Peça cadastrada, entrada de estoque, gasto lançado, conta a pagar |
| **Funcionário** | OS, venda, lançamento no financeiro, e a conta de acesso |

A moto do cliente conta como vínculo do cliente mesmo não sendo histórico:
apagar o dono deixaria a moto órfã, sem ninguém a quem cobrar na entrada
seguinte. E a conta de acesso é a trava mais dura do funcionário — apagar quem
ainda entra no sistema deixaria um login sem cadastro nenhum na oficina, que é
exatamente o defeito de "mecânico que não aparecia na OS".

### Desativar precisa significar alguma coisa

`active` já existia nos formulários de produto, cliente, fornecedor e
funcionário, mas **ninguém lia**: o cadastro marcado como inativo continuava
aparecendo em todo lugar. Oferecer "desativar" como alternativa segura ao apagar
seria mentira nesse estado.

Agora `active: false` some **de onde se escolhe** e continua **onde já foi
usado**:

| Some | Continua |
| --- | --- |
| Lista de peças da nova OS e do faturamento | A própria lista de cadastros, marcada **Inativo** |
| Busca do PDV e catálogo de peças | Toda OS, venda e entrada antiga |
| Busca de cliente da OS | O histórico do cliente e da moto |
| Motos do cliente e da frota da parceira | O relatório e o fechamento do caixa |

O cadastro inativo fica na sua própria lista de propósito: é de lá que se
reativa, abrindo o cadastro e marcando o campo "ativo" de novo.

### A venda do balcão não gravava de qual peça era

Achado ao montar essa conta: o item de venda do PDV gravava o id do produto no
campo `id`, sem `productId` — o item de OS usa `id` para o código da peça e
`productId` para o documento, e a venda seguia outra convenção. O efeito: uma
peça vendida no balcão parecia nunca ter sido usada, e seria apagada de vez com
a venda apontando para ela.

A venda passa a gravar `productId` como a OS, e a conta olha os **dois** campos,
senão as vendas feitas antes desta correção continuariam invisíveis.

A decisão inteira é de `src/removal.ts` (`npm run check:removal`, 30 casos), e o
passo 39 do roteiro ponta a ponta faz os dois caminhos no navegador: apaga uma
peça sem uso e confere que ela saiu do Firestore; desativa a peça vendida e
confere que ela continua no banco com `active: false`, aparece marcada na lista
de cadastros e sumiu da lista de peças da OS.

## Relatório do período

**Relatórios era uma casca.** A tela abria com uma lista vazia, e o botão de
exportar mandava um aviso — "Relatório exportado em formato PDF." — sem gerar
arquivo nenhum. Não havia nem escolha de período: nenhuma tela do sistema
perguntava "de quando até quando".

Agora **Gestão → Relatórios** monta o resultado do intervalo escolhido:

- **Atalhos de período**: Hoje, Últimos 7 dias, Este mês, Mês passado, Este ano —
  ou as duas datas na mão, que passam o rótulo para "Personalizado".
- **Resultado do período**, na ordem em que se lê um DRE: faturamento, menos o
  custo das peças vendidas, menos as taxas de maquininha, menos as despesas
  pagas, mais e menos as movimentações avulsas, e o lucro embaixo.
- **Margem, atendimentos, ticket médio e desconto dado** nos quatro cartões.
- **Como entrou o dinheiro**: por forma de pagamento, com a taxa da maquininha
  ao lado do total em vez de diluída no mês.
- **Peças que mais saíram**, ordenadas pelo que faturaram (e não pela
  quantidade: vinte parafusos de R$ 2 não são o resultado do mês), com o lucro
  de cada uma. E **serviços mais feitos**.
- **A receber e a pagar em aberto**, para o resultado não ser lido sem o que
  ainda está na rua.
- **Baixar planilha** gera um **CSV de verdade**: com BOM, separador `;` e
  decimal com vírgula, que é o que abre certo no Excel brasileiro e no Google
  Sheets. O nome traz o período: `relatorio-2026-09-01-a-2026-09-30.csv`.

O custo das peças entra no DRE de propósito. Sem ele o "lucro" é fantasia:
vender R$ 1.000 de peça que custou R$ 700 não são R$ 1.000 de resultado.

As contas são de `src/report.ts` (`npm run check:report`, 41 casos). A
comparação de datas é feita pelo **texto ISO**, não por `Date`: comparar
`Date` traria o fuso do navegador para dentro da conta, e um atendimento das
21h de 31 de janeiro cairia em fevereiro. Registro sem data fica de fora, em vez
de ser contado no período errado.

O passo 40 do roteiro ponta a ponta confere a tela contra o banco e contra ela
mesma: o faturamento não pode passar do que as vendas e OS encerradas somam no
Firestore, o DRE tem de bater com a tabela de formas de pagamento (são funções
diferentes calculando), "Mês passado" tem de dar zero, e o botão tem de baixar
um arquivo com BOM e `;` dentro.

## Ajuste de estoque

O estoque só se mexia por **compra, venda, OS, planilha ou XML**. Não havia como
corrigir uma contagem — e contagem errada é o estado normal de um estoque: peça
que quebrou na bancada, peça que o cliente devolveu, óleo usado na própria moto
da oficina, item digitado com a quantidade errada, ou simplesmente o saldo do
dia em que se começou a usar o sistema.

Sem esse caminho, quem precisa corrigir **inventa uma compra que não existiu**.
Aí o custo médio da peça muda, aparece uma entrada de fornecedor que ninguém
reconhece, e o relatório de compras do mês passa a mentir.

**Estoque → Ajuste de estoque** faz a correção sem disfarce:

1. Procure a peça por nome, código ou código de barras.
2. Digite **o que existe de verdade na prateleira**. O sistema mostra o que ele
   achava que tinha, a diferença e quanto ela vale em dinheiro, pelo custo.
3. Várias peças cabem na mesma conferência — uma contagem de prateleira é uma
   contagem só, ainda que corrija doze peças.
4. **O motivo é obrigatório**: Contagem de prateleira, Perda/quebra/vencimento,
   Uso interno da oficina, Devolução ao fornecedor, Devolução de cliente,
   Correção de lançamento ou Saldo inicial. Ajuste sem motivo é indistinguível
   de erro de digitação, e um estoque cheio de correções anônimas é um estoque
   em que ninguém confia. "Correção de lançamento" ainda exige dizer **qual**
   lançamento.

Três coisas o ajuste **não** faz, de propósito:

- **Não mexe no custo da peça.** É o ponto todo: o saldo passa a ser o contado, o
  custo médio fica como estava. Ajuste não é compra.
- **Não grava diferença zero.** Um ajuste que não muda nada só enche o histórico
  de linhas que não explicam nada.
- **Não soma o que não vai ser gravado.** O resumo do rodapé conta as linhas que
  mexem no saldo — mas **não espera o motivo** para aparecer: quem acabou de
  contar quatro óleos a menos precisa ver o impacto na hora, senão parece que a
  contagem não entrou.

A gravação é uma transação (`recordStockAdjustment` em `app/firebase/client.ts`):
lê os produtos, **define** o saldo como o valor contado (não soma, para duas
conferências ao mesmo tempo não se duplicarem), e escreve o ajuste em
`stockAdjustments` com quem fez, quando, o motivo, a observação e o impacto em
dinheiro. Se a peça tiver sido apagada no meio, a transação falha inteira em vez
de gravar pela metade.

Nas regras do Firestore, `stockAdjustments` é legível por quem vê estoque ou
financeiro, criável por quem gerencia estoque, e **alterável ou apagável só por
quem gerencia o financeiro** — o histórico de correções é justamente o que não
pode ser corrigido em silêncio.

As contas são de `src/stock-adjust.ts` (`npm run check:stock-adjust`, 30 casos),
e o passo 41 do roteiro ponta a ponta faz a conferência inteira no navegador:
conta 38 numa peça de saldo 42 e custo R$ 30, confere que o resumo mostra as 4
saindo e os R$ 120 antes de escolher o motivo, tenta gravar sem motivo e confere
que **nada** foi para o banco, grava com motivo, e então confere no Firestore que
o saldo virou 38, que **o custo continuou R$ 30,00** e que o ajuste ficou
registrado com o nome de quem fez.

## O caixa diz de onde veio cada real

O fechamento dizia só **"entrou tanto em vendas e OS"**. Quem confere a gaveta
do balcão no fim do dia não tinha como separar o que passou pela mão dele do
que veio da bancada: uma diferença no balcão só aparecia como diferença do
caixa inteiro, e não havia onde procurar.

Agora o diálogo do caixa mostra **De onde veio o dinheiro da gaveta**, uma
linha por origem: venda no balcão, serviço rápido, ordem de serviço, conta a
receber quitada, entrada avulsa e suprimento — e as saídas (sangria, gasto pago
pela gaveta, saída avulsa) logo abaixo. Linha zerada não aparece: uma oficina
que não fez serviço rápido hoje não precisa ler "Serviço rápido R$ 0,00".

Três decisões que valem registro:

- **Venda antiga entra como balcão.** As vendas gravadas antes de a origem
  existir não têm como ser classificadas — mas somem do esperado se forem
  ignoradas, e aí o caixa fecharia com falta todo dia.
- **A movimentação avulsa saiu de dentro do "recebido".** Somada ali, um achado
  de R$ 200 na gaveta virava recebimento de cliente no fechamento.
- **O erro só aparece depois de escrever.** O diálogo abria já com a tarja
  vermelha "informe um valor maior que zero", antes de a pessoa fazer nada — e
  erro que aparece sem motivo ensina a ignorar a tarja vermelha, inclusive
  quando ela é de verdade. A validação continua no confirmar.

`npm run check:cash` cobre a separação com um cenário próprio, e o passo 42 do
roteiro ponta a ponta confere no navegador que nenhuma linha vem zerada e que o
diálogo não abre acusando erro.

## Histórico de caixas

O histórico existia só **dentro do diálogo de abrir o caixa, cortado nos cinco
últimos**. Achar o fechamento de terça passada — porque o dinheiro não bateu e
alguém quer entender onde — era impossível.

**Gestão → Histórico de caixas** é tela própria, com os mesmos períodos do
relatório, busca por caixa/por quem abriu/pela observação, planilha CSV, e o
detalhe do fechamento abrindo ao clicar na linha.

O aviso do topo **conta os dias, não o saldo**. Uma falta de R$ 50 numa terça e
uma sobra de R$ 50 numa quinta fecham o mês em zero: olhar só o total diria que
está tudo bem, e foram dois erros. Por isso a tarja diz quantos caixas fecharam
com falta, quantos com sobra, e qual foi a maior falta — com o caixa em que
aconteceu.

Caixa antigo, fechado antes de o sistema gravar a diferença, tem a conta refeita
do contado menos o esperado, em vez de sumir do resumo.

## O ajuste de estoque no histórico da peça

O saldo mudava de 42 para 38 e o cadastro do produto **não dizia por quê**.
Agora a conferência aparece na aba Movimentação da peça, com o motivo e a
observação, valendo o custo.

O ajuste fica **fora do "entrou" e do "saiu"**: aqueles dois números respondem
quanto se comprou e quanto se vendeu desta peça, e uma quebra somada nas vendas
transformaria perda em faturamento. Ele tem o próprio cartão — "Ajustado −4 un."
—, que só aparece em peça que já foi ajustada.

A coluna Total mostrava o valor **sem sinal**, o que fazia uma quebra de R$ 120
parecer igual a uma compra de R$ 120. Agora saída sai com o sinal, como no
extrato do caixa.

## Contar a prateleira com o leitor de código de barras

Contar peça por peça na busca é o que faz um inventário levar horas. O leitor de
código de barras é um teclado: ele digita o código e dá Enter.

Em **Estoque → Ajuste de estoque**, bipar a peça:

1. traz a peça para a conferência;
2. põe o cursor na quantidade, com o número selecionado — digitar já substitui o
   saldo do sistema pelo que está na prateleira;
3. bipar a mesma peça de novo **volta para a linha dela**, em vez de criar uma
   segunda.

A comparação é **exata** (depois de aparar espaço e quebra de linha, que alguns
leitores mandam junto): uma busca "parecida" acertaria a peça errada numa
contagem, e ninguém confere de novo o que o sistema disse que achou. O código de
barras vem primeiro porque é o que o leitor manda; o código interno da peça vale
como segunda chance, para quem digita à mão.

Código que não existe avisa. Mas o aviso só aparece quando o que foi digitado
**parece um código** — um EAN de 8 ou 13 dígitos, ou o código da peça: reclamar
a cada letra de quem procura "OLE" ensina a ignorar o aviso.

## O relatório compara com o período anterior

Ver "este mês" é bom; ver contra o mês passado é o que faz decidir preço. Cada
linha do DRE traz a variação e o valor de antes, e os quatro cartões trazem o
número anterior embaixo. O botão **Comparar com o anterior** liga e desliga.

"O anterior" não é sempre a mesma conta — comparar 1 a 4 de setembro com 28 a 31
de agosto responderia a pergunta errada. As regras, na ordem:

1. **Mês inteiro** (dia 1 ao último) → o mês inteiro anterior.
2. **Mês corrente até hoje** → os mesmos dias do mês passado. Se o mês anterior
   for mais curto, para no último dia que ele tem: 1 a 31 de março compara com
   1 a 28 de fevereiro. E o dia original volta no mês que alcança, para a conta
   não andar para trás sozinha.
3. **Ano até hoje** → o mesmo trecho do ano passado.
4. **Qualquer outro** → a mesma quantidade de dias, terminando na véspera.

A cor da variação inverte nas linhas de custo: gastar 20% a mais não é uma boa
notícia pintada de verde só porque o número subiu. E **não existe "subiu 100%" a
partir de zero**: quando não havia base, a tela diz "sem base para comparar" em
vez de mostrar um número que faz o mês parecer melhor do que foi.

A planilha leva a coluna do período anterior junto, para quem monta o próprio
gráfico ter os dois lados.

## Contas que se repetem

Aluguel, energia, internet e contador eram relançados na mão todo mês. É
exatamente o tipo de conta que se esquece — e a que se esquece é a que chega com
juros. Dava para lançar 12 parcelas de uma vez, mas **parcelamento é outra
coisa**: parcela tem fim e valor fixo, e a conta de energia não tem nem um nem
outro.

No lançamento da conta há o campo **Se repete** (mensal, bimestral, trimestral,
semestral ou anual). Marcar a recorrência trava o parcelamento: as duas coisas
não podem valer juntas.

**O sistema não lança sozinho.** Não existe servidor rodando de madrugada, e um
gerador automático sem ninguém olhando é como nasce conta duplicada — que em
contas a pagar some no meio das outras até o dia em que o saldo não fecha. Em
vez disso, **Contas a pagar** ganha um painel com as competências que estão
faltando e um botão de lançar cada uma. O aviso pede para conferir o valor
antes, porque energia muda todo mês.

Detalhes que a conta exige:

- **O dia original é gravado.** Um aluguel que vence dia 31 vence dia 28 em
  fevereiro e **volta para 31 em março** — e não vira dia 3 de março (que é o que
  dá somar um mês sem olhar), nem fica no 28 para sempre.
- **Uma série pode estar atrasada em várias competências.** Quem ficou dois meses
  sem abrir o sistema vê as duas que faltam, da mais antiga para a mais nova.
- **Só até 10 dias à frente.** Lançar o aluguel de dezembro em março encheria a
  tela de contas que ninguém vai pagar tão cedo e faria o total a pagar do mês
  parecer três vezes maior do que é.
- **A trava contra duplicar** compara pela série e pela data, não pelo valor: a
  conta de luz do mês que vem vai ter outro valor e continua sendo a mesma.

A decisão inteira é de `src/recurring.ts` (`npm run check:recurring`, 42 casos).

## Peça e mão de obra, separadas

São **dois negócios dentro da mesma oficina**: um vive de comprar e revender, o
outro de hora trabalhada. Com o faturamento somado, não dá para saber qual dos
dois está sustentando o mês — e é isso que decide se vale mexer na margem da
peça ou no preço da hora.

O relatório ganhou o painel **Peça e mão de obra**: a revenda com faturamento,
custo, lucro e margem; a mão de obra com faturamento e participação no total.

Três decisões:

- **A mão de obra não mostra margem.** O sistema não sabe quanto custa a hora do
  mecânico. "Margem de 100% no serviço" seria uma mentira confortável, então a
  tela diz que o custo da hora não é cadastrado.
- **Venda paga pela metade é repartida na proporção dos itens.** Uma OS de
  R$ 1.000 (600 de peça, 400 de serviço) que recebeu R$ 500 entra com 300 e 200.
  Chutar tudo para um lado inventaria faturamento onde não houve.
- **O que não dá para separar fica declarado.** Atendimento gravado sem lista de
  itens aparece como "não deu para separar", e não é empurrado para um dos lados:
  empurrar para o serviço faria a revenda parecer menor do que é, e o contrário
  faria a oficina parecer uma loja de peças. Serviço rápido sem item é a única
  exceção — ele é mão de obra por natureza.

## Colar um valor já formatado

Achado durante os testes: quem copiava **"R$ 2.500,00"** do WhatsApp do
fornecedor e colava no campo de valor via o campo continuar **vazio**, sem
nenhum aviso. A regra que aceita o que se digita (`isPartialNumber`) recusa dois
separadores — com razão, porque no meio da digitação eles não existem —, e a
colagem sumia em silêncio.

Agora o campo aceita o valor colado no formato brasileiro (`2.500,00`, com ou
sem `R$`, com espaço normal ou o não separável que vem do Excel) e no americano
(`2,500.00`, que aparece em planilha exportada). O que não é valor nenhum
continua sendo recusado, como antes.

## Cópia de segurança

**O Firestore no plano gratuito não faz backup nenhum.** Se alguém apagar os
produtos ou o histórico de OS, não existe de onde recuperar.

Em **Administração** há o botão **Baixar backup**: ele lê todas as coleções da
oficina e entrega um arquivo `.json` — produtos, clientes, motos, OS, vendas,
entradas de estoque, contas, gastos, movimentações, caixa, fornecedores,
categorias, parceiros, serviços rápidos, formas e máquinas de pagamento,
funcionários e usuários.

Ficam **de fora** de propósito: o registro de auditoria (`auditLogs`), os perfis
de acesso (`userAccess`) e a remuneração dos funcionários
(`employeeCompensation`). São dados de segurança e de pessoal, não da operação —
um arquivo baixado no celular não é lugar para eles.

Se alguma coleção falhar na leitura, o backup **não é abortado**: o resto é
salvo e a tela diz o que faltou, para a pessoa saber o que não está protegido.
Um backup com 17 das 18 coleções vale muito mais que nenhum.

### Quando ele avisa

A data do último backup fica em `settings/global.lastBackupAt` — no banco, e não
no navegador, para valer em qualquer aparelho: guardada localmente, o celular
acharia que nunca houve backup feito no computador.

Passado **um dia**, a faixa em Administração fica âmbar e cobra. Um dia de
vendas, OS e caixa perdido já dói o suficiente para valer o incômodo.

### O que este backup não é

- **Não é automático.** O navegador só executa quando está aberto. Backup
  automático de verdade exige servidor.
- **Não envia para o Google Drive sozinho.** Uma conta de serviço não tem cota
  de armazenamento e não pode ser dona de arquivo no Drive
  ([documentação do Google](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)),
  e Drive Compartilhado é recurso de conta Workspace paga. Enviar para o Drive
  só funciona autorizado pela pessoa, no navegador.
- **Não substitui o backup do Firebase.** O agendado nativo existe e roda
  sozinho, mas exige o plano Blaze.

O arquivo tem os dados dos seus clientes. Guarde-o com o mesmo cuidado que teria
com uma agenda de papel da oficina — não em pasta compartilhada, não no grupo do
WhatsApp.

**Um backup só vale depois de testado.** Abra o arquivo uma vez e confira que os
produtos e as OS estão lá dentro.

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
- [ ] `npm run check:cash` sem falhas
- [ ] `npm run check:permissions` sem falhas
- [ ] `npm run check:api-imports` sem falhas
- [ ] `npm run check:mechanic` sem falhas
- [ ] `npm run check:backup` sem falhas
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
