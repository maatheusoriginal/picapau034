# Validação da atualização

## Verificações realizadas

- Verificação TypeScript sem erros.
- Compilação de produção com Vite concluída.
- 30 grupos de verificações automáticas aprovados: financeiro, estoque,
  documentos, importação, caixa, permissões, APIs administrativas, mecânicos,
  frotas, remoção de cadastros, relatórios, ajustes, recorrência, backup, hooks,
  dados Firestore, campos numéricos, parceiros, código de barras, catálogo de
  motos, placas, históricos, padronização de texto, vínculo da equipe, preços,
  ajuda, leitura de NF-e, configurações, mensagens de erro do Firebase e a nova
  área de trabalho.
- A nova verificação cobre rotas e acesso de consulta, datas brasileiras e ISO,
  prazos vencidos, distinção entre prontas e entregues, alertas de estoque,
  busca por nome/placa/telefone, prioridade do código de barras, quantidade,
  preço por unidade, custo e reservas já baixadas.

Execute `npm run verify` para repetir as verificações e `npm run build` para
compilar a aplicação.

## Limites

Esta validação foi feita sobre o código recebido e atualizado, sem conexão com
o Firebase de produção da oficina. Não foram testados login real, sincronização
entre dispositivos, transações concorrentes no servidor, permissões das regras
em execução, impressão física na Elgin i9 ou a interface em um navegador.
Os testes de lógica não substituem essas conferências no ambiente da oficina.

As regras de acesso foram preservadas. Permissões de fluxo precisam ser
compatíveis: uma operação que altera OS, estoque e financeiro precisa de acesso
a esses módulos. A nova interface não concede permissões adicionais no banco.

Para usar o sistema, configure as credenciais e siga o README. A compilação
entregue como código-fonte deve ser executada com as variáveis corretas da sua
instalação. Não foram incluídos dados fictícios ou credenciais de produção.

## Atualização: logomarca

Verificados: TypeScript; montagem dos documentos e três vias da OS; inclusão e remoção da imagem; opções separadas de cupom/A4; largura do papel de 58 mm; busca da nova aba; rejeição de formatos não suportados e arquivos acima de 5 MB. A impressão aguarda a imagem ficar pronta. A impressão física na Elgin i9 e o envio real ao Firebase continuam dependendo do ambiente da oficina.

## Atualização: versão 3 rodada de ponta a ponta no emulador

A validação acima foi feita sobre a lógica, sem navegador. Esta rodada foi
diferente: o roteiro `scripts/emulador/e2e.mjs` abre o Chromium contra o
**build** da versão 3 servido por `vite preview`, com o Emulator Suite do
Firebase (Auth e Firestore) carregando o `firestore.rules` de verdade. Cada
resultado é conferido lendo o documento no Firestore, não o texto da tela.

O roteiro precisou ser reescrito na linguagem da versão 3, que mudou nomes,
caminhos e etapas: "Abrir nova OS" virou "Novo atendimento"; o menu promoveu
cinco destinos para o topo com rótulo curto ("Produtos e estoque" é o botão
"Estoque"); o balcão passou a pedir a quantidade antes de a peça entrar na
venda; a mão de obra da OS entra por um editor que só inclui o item ao
confirmar; e o rodapé da OS separou "Salvar alterações" de "Receber e
entregar" — quem clicava no botão primário encerrava a OS sem cobrar nada.

### Placar

42 dos 45 passos passam. Os três que reprovam são a mesma coisa, medida em
três telas: **a versão 3 trocou densidade por legibilidade**, e agora as telas
rolam. O `app/workspace.css` ("All forms keep the same readable scale", linhas
203-207, e a regra de celular na linha 224) sobe todo campo de formulário para
41-43px e empilha o rótulo em cima do campo na OS, passando por cima das
regras compactas que o `app/globals.css` continua tendo (linhas 658-676 e
2842-2854). É uma troca deliberada — o próprio MELHORIAS-V3.md diz "campos
maiores" — e o preço dela é este:

- **celular do mecânico**: a OS termina em 890px numa tela de 844px, então ele
  precisa rolar para ver o que tem de fazer;
- **nova OS no balcão**: 948px de conteúdo numa área de 749px, então
  "Mecânicos responsáveis" e o bloco de peças e serviços ficam abaixo da dobra;
- **cadastro de peça**: 870px numa área de 764px.

Restaurar só a régua de rótulos da OS (`app/globals.css:671`, desligada por
`app/workspace.css:207`) devolve cerca de 200px sem encolher campo nenhum, e
sozinha resolve a nova OS. O celular e o cadastro de peça só cabem encolhendo
o campo, que é justamente o que a versão 3 aumentou de propósito.

A decisão é da oficina: ler mais fácil ou não rolar. Enquanto ela não for
tomada, os três passos ficam reprovando de propósito — é o jeito de a conta
não sumir.

## Atualização: o atendimento em três etapas (09/09/2026)

A oficina recebeu de outra fonte uma reescrita da tela de novo atendimento e
preferiu ela. Esta entrega traz essa reescrita para cima da versão que já
estava publicada, sem perder o que veio antes: a permissão de receber e
entregar, o "pegar peça" do mecânico, o lançamento de OS antiga, o número da OS
do parceiro e os ajustes da tela do mecânico no celular continuam como estavam.

Encaixou sem conflito porque os territórios não se cruzam: a reescrita não
tocou em `app/globals.css`, e os dois últimos commits anteriores foram só nele.
Conferido antes de copiar, não depois.

### O que mudou para quem usa

A abertura passou a ser dois cartões — ordem de serviço e serviço rápido —, com
o lançamento de OS antiga como opção secundária. O preenchimento voltou a ser
passo a passo, agora em três etapas (identificação, serviço, conferência), e a
conferência mostra cliente, moto, placa e forma de pagamento antes de gravar.

### O roteiro de ponta a ponta

Foi reescrito para o fluxo novo, e é isso que dá confiança de que a operação do
dia a dia continua fechando. Cinco diferenças travavam os passos, e nenhuma
delas aparecia no typecheck nem nas conferências de função pura:

1. O botão "Cadastrar cliente" saiu do aviso de "nada encontrado" e virou ação
   fixa ao lado de "Atender sem cadastrar agora".
2. A versão da moto deixou de ser lista e virou campo escrito: são dois
   selects agora, e pedir o terceiro trava.
3. Quilometragem, prazo e mecânicos foram para dentro de "Equipe e detalhes da
   recepção", que abre recolhida.
4. No serviço rápido, "Cliente e motocicleta" também vem recolhido.
5. O total saiu de `.os-single-total` para `.intake-footer-total`.

As duas gavetas recolhidas merecem nota: os campos EXISTEM no documento mesmo
fechados, então o roteiro os encontrava e travava em "element is not visible" —
erro que não diz que faltou abrir a gaveta. É o tipo de coisa que só aparece
abrindo o navegador de verdade.

### Duas conferências que mudaram de lugar, e não sumiram

Os passos 20 e 38 mediam "tudo cabe numa tela só". Essa forma foi trocada por
escolha da oficina, mas a razão dela continua valendo, então a exigência mudou
de lugar em vez de ser apagada:

- O passo 20 cobra que a PRIMEIRA etapa resolva quem responde pela OS. Se essa
  escolha migrasse para o fim, o balcão preencheria moto e serviço para só
  então descobrir quem paga.
- O passo 38 mede as três etapas, uma a uma: se cada uma rolar, o balcão volta
  a perder de vista o que preenche — o problema original repetido três vezes.
  Também cobra que a conferência mostre o total e a placa, porque conferência
  sem valor não responde "está tudo certo?".
