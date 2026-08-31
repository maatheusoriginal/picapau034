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
