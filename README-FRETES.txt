BrenntagHub - Fretes

1. No Supabase SQL Editor, execute:
   brenntag_frete_patch.sql

2. Depois substitua no projeto:
   app.js
   admin.js
   admin.html
   style.css
   admin.css

3. Faça commit e push normalmente.

O sistema inclui:
- Econômico, Padrão e Expresso
- preço editável no Admin
- ativar/desativar modalidades
- adicionar e remover modalidades
- frete grátis ativável/desativável
- valor mínimo para frete grátis
- escolha do frete no checkout
- frete somado ao total do pedido
- frete salvo no pedido
- observação do pedido salva no pedido
- detalhes do pedido no Admin
- endereço, produtos, pagamento, frete, descontos, total e NF no detalhe
- frete exibido no documento preliminar da NF

Importante:
O frete é calculado novamente no servidor. O valor enviado pelo navegador não é usado como autoridade.
