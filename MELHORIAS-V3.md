# Melhorias da versão 3.0

## Organização e uso

- Menu principal concentrado em Meu dia, Oficina, Balcão, Estoque e Clientes.
- Recursos complementares agrupados em Mais opções e atalhos no celular.
- Endereço próprio para cada área; atualizar a página e voltar pelo navegador mantêm a navegação.
- Busca abre o registro escolhido e aceita acentos, telefone formatado, placa, código de barras e referência.
- Navegação da busca por teclado e foco contido nos formulários principais.
- Textos maiores, contraste mais legível, campos maiores e visual consistente.
- Consulta de cadastros sem apresentar uma edição que o usuário não pode salvar.
- Aviso antes de descartar alterações de formulário e antes de sair com vendas na sessão.

## Operação

- Painel com ações do dia, prazos vencidos, aprovações, retiradas, contas e reposição.
- OS em lista ou cartões, com filtros por etapa, prazos e histórico de entregues.
- Itens reais na OS, inclusão de peças e serviços, ajuste de quantidades e totais.
- Diagnóstico, observações e prazo editáveis no acompanhamento.
- Salvar andamento separado de receber e entregar a moto.
- Histórico de vendas com detalhes, pagamentos, reimpressão e CSV.
- Histórico de entradas com fornecedor, peças, quantidade, custo e valores reais por período.
- PDV usa o código de barras verdadeiro e prioriza a correspondência exata.
- Ao escolher uma peça no PDV, a quantidade é informada antes da inclusão.
- F2 e F10 funcionam; o estado do caixa vem da sessão real.
- Pausar e retomar vendas funciona dentro da sessão, com o limite explicado na tela.

## Correções de consistência

- Configurações deixa de redirecionar indevidamente quem tem permissão de leitura.
- Ajuste de estoque respeita a permissão de gestão do estoque.
- OS encerrada não é contabilizada como pronta para retirar nem fica editável na interface.
- OS inexistente não abre silenciosamente a primeira da lista.
- Contas a pagar no painel incluem os lançamentos financeiros e os gastos agendados.
- Notificações exibem pendências reais; a antiga ação que só dizia marcar como lida foi retirada.
- Filtros de estoque usam os saldos, em vez de depender de um texto de status antigo.
- Alterações de OS e reservas usam transação e releem as reservas atuais, evitando repetir a baixa da mesma reserva.
- A transação confere estoque insuficiente quando o bloqueio de venda sem estoque está ligado.
- O formato histórico foi mantido: preço e custo do item representam o total da linha. A quantidade não é multiplicada novamente nos históricos.
- O servidor local lê o `.env`, e o comando de produção não depende de sintaxe de terminal Unix.

## Mantido

Autenticação Firebase, regras de acesso existentes, cadastros, serviço rápido,
parceiros e frotas, desconto na mão de obra, pagamentos divididos, nota a prazo,
faturamento de parceiro, baixas financeiras parciais, impressão e WhatsApp,
compras, importações, inventário, equipe, relatórios, recorrência e backup.

A atualização não instala um modo offline completo, não compartilha rascunhos de
venda entre dispositivos e não substitui a configuração de Firebase e impressão.
Não houve publicação na hospedagem da oficina nem alteração do banco em produção.
