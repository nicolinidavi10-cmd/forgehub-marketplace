SISTEMA DE FRETES - BRENNTagHUB

1. Abra o arquivo:
   brenntag_frete_patch.sql

2. Cole o conteúdo inteiro no Supabase > SQL Editor e execute.

3. O SQL cria:
   - shipping_methods
   - shipping_settings
   - 3 opções iniciais: Econômico, Padrão e Expresso
   - campos de frete em orders

4. Depois do SQL, o próximo passo é atualizar app.js e admin.js para:
   - cliente escolher o frete no checkout
   - calcular frete grátis
   - administrador editar/ativar/desativar fretes
   - mostrar frete no detalhe do pedido
   - registrar o valor escolhido no pedido

IMPORTANTE:
O SQL sozinho prepara o banco; ele não altera a interface do site.
