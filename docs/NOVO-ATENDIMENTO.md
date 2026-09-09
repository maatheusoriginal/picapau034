# Novo atendimento · atualização de 09/09/2026

## Experiência

- Entrada com duas opções principais: OS de oficina e serviço rápido. O registro
  histórico fica em uma opção secundária.
- OS em três etapas, com identificação antes da recepção e uma conferência final.
- Resumo lateral no computador. Em telas menores, o resumo completo fica na
  conferência, e o total permanece no rodapé.
- Uma área central de rolagem, botões de navegação separados do conteúdo, campos
  de 16 px e áreas de toque maiores no celular, considerando as áreas seguras.
- Recepção com o problema e a inclusão de itens em destaque. Equipe, prazo,
  prioridade e dados de entrada ficam em um bloco expansível.
- Confirmação com o número salvo e acesso direto ao acompanhamento da OS.
- Estados de busca vazia, validação, serviço em edição, salvamento e conclusão.

## Correções funcionais

- Reabrir a OS ou o serviço rápido começa um novo atendimento, inclusive pelos
  atalhos externos à escolha de atendimento.
- Uma busca digitada não é tratada como um cliente selecionado.
- Placa inválida e dados incompletos de identificação são indicados antes da
  navegação para o serviço. O foco retorna ao campo correspondente.
- Placa já cadastrada exige seleção explícita, preservando o proprietário.
- O cadastro completo de cliente ou moto retorna ao estado selecionado da OS.
- A busca por nome aceita diferenças de acentuação.
- Marcar apenas a marca da moto não satisfaz a identificação. Para um cliente
  identificado, o modelo pode ser informado sem placa; frota e cliente pendente
  exigem placa.
- Combustível e odômetro não são registrados como conferidos por padrão.
- Preços por unidade, quantidades e totais são editáveis no editor de itens;
  custos existentes são preservados proporcionalmente às quantidades.
- O desconto de parceria na abertura acompanha a responsabilidade pelo pagamento.
- O serviço rápido salva cliente e identificação da moto na venda e no cupom.
  Produtos são selecionados pelo ID, e o preço é preenchido ao selecionar.
- A conta de entrada escolhida no serviço rápido é preservada, inclusive quando
  corresponde a uma maquininha.
- Valores inválidos e estoque insuficiente no serviço rápido são recusados.
- O mesmo salvamento não é disparado novamente enquanto está em andamento.
  Se a OS foi criada e a reserva de peças falhou, a nova tentativa usa a mesma
  OS; a função transacional existente confere as reservas já feitas.

## Arquivos principais

- `app/page.tsx`: integração do fluxo, estado e gravação.
- `src/attendance.ts`: validação da identificação e dos itens.
- `src/components/AttendanceSummary.tsx`: resumo, conferência e totais.
- `src/components/OrderItemsEditor.tsx`: inclusão e edição dos itens.
- `src/components/attendance.css`: apresentação e responsividade do atendimento.
- `src/types.ts` e `src/documents.ts`: identificação da moto no serviço rápido.

A arquitetura React/Vite/Firebase, as regras de acesso e as configurações
recebidas continuam sendo utilizadas. Não há migração de banco nesta entrega.
O código deve ser compilado com as variáveis Firebase da instalação existente;
a hospedagem atual não foi alterada.

## Verificação

As verificações desta entrega estão no início de `VALIDACAO.md`. Os testes
específicos podem ser executados com `npm run check:attendance` e
`npm run check:attendance-render`. O segundo comando faz renderização em Node,
sem navegador ou acesso ao Firebase.

O roteiro antigo `scripts/emulador/e2e.mjs` foi preservado como recebido. Ele
contém seletores e expectativas da antiga tela única e não foi executado nem
certificado para este novo fluxo. Não faz parte do comando `npm run verify`.
