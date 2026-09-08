# Guia de uso · Pica Pau Motos

## Começar o dia

Abra **Meu dia**. A tela reúne os atendimentos que precisam de atenção, as motos
na oficina, aprovações pendentes, retiradas, recebimentos, contas e reposição.
Os valores aparecem conforme as permissões de cada pessoa.

Confira o cartão do caixa. Se estiver fechado, quem tem permissão no financeiro
pode abri-lo e informar o fundo de troco. Um caixa de outro dia aparece com aviso
para conferência.

## Encontrar rapidamente

Use a busca no topo ou **Ctrl K** / **⌘ K**. Ela encontra OS, nomes, telefones,
placas, códigos de barras, referências, motos, fornecedores e áreas do sistema.
Não é necessário digitar acentos, hífen da placa ou pontuação do telefone.

Use as setas para escolher e Enter para abrir o registro. Escape fecha a busca.
Quem possui somente consulta vê os dados e o histórico sem poder editar.

## Atender uma moto

1. Clique em **Novo atendimento**.
2. Escolha serviço rápido, se for resolver na hora, ou OS para a moto que ficará
   na oficina. As opções respeitam os acessos do usuário.
3. Identifique cliente ou parceiro, selecione a moto e informe o problema.
4. Registre a recepção, o prazo e os mecânicos. Acrescente as peças e os serviços
   que já souber usando **Adicionar peça** e **Adicionar serviço**.
5. Confira o total e abra a OS.

O cadastro do proprietário, o pagador e a origem continuam disponíveis. Nos
atendimentos encaminhados, o desconto da empresa parceira continua restrito à
mão de obra. Uma moto pode ser recebida com identificação pendente conforme o
fluxo existente; o fechamento pede os dados que faltarem.

## Acompanhar e concluir

Em **Oficina**, escolha cartões ou lista. Filtre por etapa ou consulte as OS
entregues. As prontas aguardando retirada ficam separadas das já encerradas.
Os atrasos usam a previsão de entrega cadastrada.

Ao abrir uma OS, confira os itens reais. Durante o atendimento, quem tem
permissão pode ajustar quantidades, incluir peças e serviços, registrar o
diagnóstico, anotar observações e mudar o prazo. Clique em **Salvar alterações**.
A baixa ou devolução de peças segue a configuração da oficina.

Quando o serviço terminar, marque a OS como pronta e salve. Quem cuida do
financeiro usa **Receber e entregar**, confere os itens e registra o pagamento.
Essa ação continua oferecendo pagamentos divididos, nota a prazo e faturamento
no parceiro. OS encerrada fica disponível para consulta e reimpressão.

Registros antigos sem itens detalhados conservam o valor original; o sistema
não inventa uma divisão entre peças e mão de obra para eles.

## Vender no balcão

1. Abra **Balcão**. Pressione **F2** para focar a busca.
2. Digite a peça, a referência ou leia o código de barras.
3. Escolha o produto, informe a quantidade e clique em **Adicionar** ou pressione Enter.
4. Ajuste as quantidades na própria venda. Informe o desconto, se necessário.
5. Pressione **F10** ou clique em **Receber**. O caixa precisa estar aberto.
6. Defina o cliente, as formas de pagamento e as parcelas na próxima etapa e confirme.

**Pausar venda nesta sessão** coloca a venda em espera e libera o balcão para a
próxima pessoa. A lista mostra horário, itens e total para retomada. As vendas em
espera ficam apenas na memória desta aba: não são compartilhadas com outro
computador e não sobrevivem a recarregamento, fechamento ou saída do sistema.
O navegador recebe um pedido de aviso se houver trabalho em andamento, mas essa
proteção depende do navegador, especialmente no celular. Conclua as vendas antes
de sair.

## Consultar vendas e compras

Em **Mais opções → Balcão → Vendas do balcão**, consulte as vendas por período,
cliente ou peça. Abra uma linha para ver os itens, o pagamento e reimprimir o
comprovante. O CSV leva os registros do filtro escolhido.

Em **Mais opções → Estoque → Compras e entradas**, acompanhe as entradas
confirmadas, o fornecedor, as quantidades e os custos. **Nova entrada** registra
uma compra. Importação por planilha e XML continua em Produtos e estoque.

## Cuidar do estoque

Em **Estoque**, procure por peça, código, referência, grupo ou localização.
Os filtros **Reposição**, **Crítico** e **Sem estoque** usam os saldos atuais.
Produtos desativados e alertas desligados não entram na lista de reposição.
Ajuste de contagem, fornecedores e compras ficam em Mais opções.

## Financeiro e configuração

Em **Mais opções → Gestão**, ficam contas a pagar, contas a receber, financeiro,
histórico de caixas e relatórios. Os valores respeitam baixas parciais e formas
de pagamento: uma venda a prazo não aparece como dinheiro já recebido.

As configurações ficam organizadas por assunto. Quem possui somente leitura
pode consultá-las. Usuários, acessos e administração continuam restritos ao
administrador.

## Usar no celular

A barra inferior abre as áreas do dia a dia e o menu completo. OS em cartões
mostram cliente, moto, placa, responsável, prazo e ação. Os formulários usam
campos maiores. No computador, o botão de menu no topo recolhe a lateral e
libera mais espaço para o trabalho.

## Impressão e WhatsApp

Os comprovantes e as três vias da OS mantêm as configurações já existentes.
Confira a largura do papel e a impressora em Configurações. O botão WhatsApp
abre a mensagem para revisão e envio pelo operador.

## Logomarca nos documentos

Em **Configurações → Logomarca**, escolha uma imagem PNG, JPG ou WebP de até 5 MB. Confira a prévia, selecione o tamanho e clique em **Salvar logomarca**. A imagem é ajustada sem distorção e passa a aparecer nos cupons térmicos de 58 ou 80 mm, nas vias da OS e nos comprovantes A4. Você pode ativar cada formato, trocar a imagem, removê-la ou imprimir um teste sem registrar venda. Após remover, salve para aplicar.

Os documentos emitidos pelo sistema são não fiscais. A configuração de logomarca não acrescenta emissão de NF-e, NFC-e ou NFS-e. Na prévia do link, a imagem dura apenas até recarregar a página; no sistema conectado ao Firebase, a configuração é salva para a oficina.
