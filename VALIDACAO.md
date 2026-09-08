# Validação da atualização

## Verificações realizadas

- Verificação TypeScript sem erros.
- Compilação de produção com Vite concluída.
- 29 grupos de verificações automáticas aprovados: financeiro, estoque,
  documentos, importação, caixa, permissões, APIs administrativas, mecânicos,
  frotas, remoção de cadastros, relatórios, ajustes, recorrência, backup, hooks,
  dados Firestore, campos numéricos, parceiros, código de barras, catálogo de
  motos, placas, históricos, padronização de texto, vínculo da equipe, preços,
  ajuda, leitura de NF-e, configurações e a nova área de trabalho.
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
