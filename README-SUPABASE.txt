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
