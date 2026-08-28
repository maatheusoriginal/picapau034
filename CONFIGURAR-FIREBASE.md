# Configuração do Firebase — Pica Pau Motos

Esta versão não possui modo demonstração. Sem login válido, o sistema não abre.

## 1. Firebase Authentication

No Firebase Console do projeto `oficinapicapaumotos34`:

1. Abra **Authentication → Sign-in method**.
2. Ative **E-mail/senha**.
3. Em **Authentication → Users**, confirme que existe a conta que será o primeiro Super Admin.
4. Em **Authentication → Settings → Authorized domains**, adicione o domínio onde o sistema estiver sendo executado. No Google AI Studio, copie apenas o domínio exibido no Preview, sem `https://` e sem caminho.

## 2. Firestore

1. Abra **Firestore Database**.
2. Abra a aba **Rules**.
3. Substitua as regras atuais pelo conteúdo do arquivo `firestore.rules` deste projeto.
4. Clique em **Publish**.

As regras fazem o bloqueio de verdade no banco. Esconder um botão na tela não é usado como segurança.

## 3. Firebase Admin no Google AI Studio

Acesse **Project settings → Service accounts** no Firebase Console e gere uma nova chave privada.

No Google AI Studio, cadastre o JSON completo como Secret/variável de servidor:

`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`

O JSON da conta de serviço é privado. Não coloque esse conteúdo em `.env` enviado ao GitHub e não faça commit da chave.

## 4. Defina quem será o primeiro Super Admin

No Google AI Studio adicione outra variável de servidor:

`INITIAL_SUPER_ADMIN_EMAIL`

O valor deve ser exatamente o e-mail da conta que você quer usar como primeiro Super Admin.

Exemplo de formato:

`responsavel@empresa.com`

Não precisa colocar aspas.

## 5. Primeiro acesso

1. Reinicie o app depois de cadastrar as variáveis.
2. Entre na nova tela de login com a conta definida em `INITIAL_SUPER_ADMIN_EMAIL`.
3. Como ainda não existe `userAccess/{uid}`, aparecerá **Configurar primeiro administrador**.
4. Clique uma única vez.
5. O backend criará o perfil `Super Admin` no Firestore usando o mesmo UID do Authentication.
6. O sistema abrirá automaticamente assim que o perfil for recebido em tempo real.

O bootstrap deixa de funcionar assim que existir um **Super Admin ativo** em `userAccess`.

## 6. Liberar os outros usuários que já existem

Depois de entrar como Super Admin:

1. Abra **Usuários e acessos**.
2. As contas existentes no Firebase Authentication aparecem na lista.
3. As que ainda não possuem perfil aparecem como **Authentication / Sem acesso**.
4. Clique em **Liberar**.
5. Escolha funcionário, função e permissões.
6. Salve.

Para usuários novos, use **Criar novo usuário** nessa mesma tela. O sistema cria a conta no Firebase Authentication e o perfil no Firestore juntos.

## 7. Resultado

- O botão **Ativar Firebase** não existe mais.
- Sem autenticação, só aparece Login.
- A sessão permanece salva no navegador.
- Existe recuperação de senha por e-mail.
- Usuário desativado não entra.
- Usuário sem perfil não acessa o sistema.
- Super Admin cria, edita, troca senha, desativa e apaga usuários.
- Menus e ações seguem as permissões individuais.
- Firestore Rules reforçam essas permissões no banco.
