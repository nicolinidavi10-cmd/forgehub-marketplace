# NF revisada pela ADM + envio por e-mail

Esta versão adiciona um fluxo separado para a Nota Fiscal/documento de venda:

1. O cliente finaliza o pedido.
2. O site gera automaticamente um PDF preliminar da NF/documento e tenta armazená-lo no Supabase Storage.
3. O pedido aparece no Admin com a coluna **NF**.
4. A ADM pode **Visualizar**, **Baixar**, **Adicionar/Substituir PDF** e clicar em **OK — Aprovar NF**.
5. Depois da aprovação aparece **Enviar**.
6. A ADM pode editar assunto e mensagem antes do envio.
7. A Edge Function envia somente a NF em PDF para o e-mail registrado no pedido.

A NF e o pedido são fluxos separados. Enviar a NF não envia o pedido nem altera o status do pedido.

## 1. Supabase SQL

No Supabase > SQL Editor, execute **somente o bloco** que começa em:

`-- NOTAS FISCAIS / DOCUMENTOS DE VENDA — BLOCO INDEPENDENTE`

Ele está no final de `brenntag_supabase_patch.sql`.

Esse bloco:
- salva o e-mail do comprador no pedido;
- cria os campos de NF;
- cria o bucket privado `invoices`;
- cria as políticas de upload/visualização;
- cria a função `admin_review_invoice`.

Não execute `DROP` de `create_order`.

## 2. Edge Function para envio de e-mail

Arquivo:

`supabase/functions/send-invoice-email/index.ts`

A função usa a API do Resend. Ela verifica se quem chamou é administrador, baixa o PDF privado do Storage e envia o anexo para `orders.customer_email`.

### Deploy com Supabase CLI

Na pasta do projeto:

```powershell
supabase functions deploy send-invoice-email
```

Depois configure os secrets:

```powershell
supabase secrets set RESEND_API_KEY="SUA_CHAVE_DO_RESEND"
supabase secrets set RESEND_FROM_EMAIL="BrenntagHub <seu-email@seudominio.com>"
```

A `SUPABASE_URL` e a `SUPABASE_SERVICE_ROLE_KEY` são fornecidas automaticamente pelo ambiente da Edge Function no Supabase.

### Resend

Para produção, use um domínio/remetente verificado no Resend. Para testes, siga as limitações de envio da conta do Resend.

## 3. Publicação do site

Depois de testar:

```powershell
git add .
git commit -m "Adiciona fluxo de NF revisada e envio por email"
git push
```

A Vercel fará o deploy do site.

## Observação fiscal

O PDF preliminar gerado pelo site é um documento de venda para revisão e é explicitamente marcado como **sem valor fiscal**. Se a operação for fiscal de verdade, o PDF correto deve ser substituído pela NF-e/DANFE emitida pelo processo fiscal apropriado antes do envio.
