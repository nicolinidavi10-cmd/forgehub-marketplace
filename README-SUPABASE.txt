BRENNTAG + SUPABASE

1) No Supabase, rode primeiro o SQL principal que você já recebeu.
2) Depois rode: brenntag_supabase_patch.sql
3) Em Settings > API Keys, copie a Project URL e a Publishable Key.
4) A Project URL usada no projeto é:
   https://cyqudohwjllouvwisshk.supabase.co
   (sem /rest/v1/)
5) supabase-config.js já está preenchido com a Project URL e a Publishable Key informadas.
6) NUNCA use a Secret Key / Service Role Key no navegador.
7) Abra login.html. A conta criada no Supabase que foi promovida para role=admin já poderá entrar no painel.
8) Novos usuários criados pelo site entram como customer.

O site deixa de usar localStorage para produtos, pedidos, estoque, despesas e termos.
O carrinho permanece apenas na sessão atual do navegador.
A sessão de autenticação é gerenciada pelo Supabase Auth.


==========================================================
NOVO PATCH — PRODUTO, ENDEREÇO, PAGAMENTO E DESCONTOS
==========================================================

Execute no Supabase SQL Editor, depois dos patches anteriores:

brenntag_checkout_product_payment_patch.sql

O patch:
- adiciona Código do produto na tabela products;
- cria formas de pagamento Pix, Cartão de crédito e Boleto;
- permite ativar/desativar essas formas pelo Financeiro do painel;
- salva endereço de entrega no pedido;
- salva a forma de pagamento escolhida no pedido;
- mantém create_order(jsonb, integer) existente e cria uma nova versão para o checkout;
- impede acúmulo entre desconto progressivo e cupom: somente o maior desconto é aplicado.

Depois de executar o SQL:
1. abra o painel administrativo;
2. em Financeiro, confira "Formas de pagamento";
3. teste ativar/desativar uma opção;
4. em Gestão de produtos, edite/cadastre e informe o Código do produto;
5. na loja, faça um teste de checkout preenchendo endereço e pagamento.

IMPORTANTE:
O novo código já está preparado para o banco atualizado. Sem executar este SQL,
o checkout novo e a área de formas de pagamento não funcionarão corretamente.
