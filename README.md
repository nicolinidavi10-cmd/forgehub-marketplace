# ForgeHub — Marketplace Industrial

Protótipo inicial para abrir no Visual Studio Code.

## Como executar
1. Extraia o ZIP.
2. Abra a pasta no Visual Studio Code.
3. Abra o arquivo `index.html` no navegador ou use a extensão Live Server.

## Login administrativo
- `login.html` — tela de login simples, apenas front-end.
- Qualquer usuário e senha preenchidos são aceitos por enquanto.
- O acesso é mantido apenas durante a sessão do navegador e o painel redireciona para o login se acessado diretamente sem autenticação.

## Painel administrativo
- `admin.html` / `admin.css` / `admin.js` — Dashboard (Visão Geral), com dados simulados.
- Abra `admin.html` no navegador para ver: cards principais, gráfico de
  movimentação financeira, composição do estoque, atalhos rápidos e
  últimas movimentações.
- Os links do menu lateral para Pedidos, Estoque, Gestão de Produtos e
  Financeiro ainda estão marcados "em breve" — são as próximas telas.

## Próximas etapas
- Login administrativo protegido.
- Telas de Pedidos, Estoque, Gestão de Produtos e Financeiro (hoje só a Visão Geral existe).
- Cadastro/edição de produtos, ligado ao catálogo da loja pública.
- Controle de entradas, saídas e devoluções de estoque.
- Financeiro: receita bruta, custos, despesas, valor líquido e resultado.
- Pedidos, separação, expedição e comprovante de pagamento simulado.
- Banco de dados para persistência das informações (hoje tudo é simulado no admin.js).
