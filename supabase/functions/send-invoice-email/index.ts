import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'BrenntagHub <onboarding@resend.dev>';

    if (!resendKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRole);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const { data: adminProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || adminProfile?.role !== 'admin') {
      return json({ error: 'Apenas administradores podem enviar NFs.' }, 403);
    }

    const body = await req.json();
    const orderId = Number(body.order_id);
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();

    if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: 'Pedido inválido.' }, 400);
    if (!subject) return json({ error: 'Informe o assunto do e-mail.' }, 400);
    if (!message) return json({ error: 'Informe a mensagem do e-mail.' }, 400);

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, customer_email, customer_id, nf_storage_path, nf_file_name, nf_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return json({ error: 'Pedido não encontrado.' }, 404);
    if (!order.customer_email) return json({ error: 'O pedido não possui e-mail do comprador.' }, 400);
    if (!order.nf_storage_path) return json({ error: 'Nenhuma NF foi anexada ao pedido.' }, 400);
    if (!['Aprovada', 'Enviada'].includes(order.nf_status)) {
      return json({ error: 'A NF precisa ser revisada e aprovada antes do envio.' }, 400);
    }

    const { data: fileData, error: fileError } = await adminClient.storage
      .from('invoices')
      .download(order.nf_storage_path);

    if (fileError || !fileData) return json({ error: 'Não foi possível acessar o PDF da NF.' }, 500);

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [order.customer_email],
        subject,
        text: message,
        attachments: [{
          filename: order.nf_file_name || `NF-${String(order.id).padStart(6, '0')}.pdf`,
          content: base64,
        }],
      }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      return json({ error: resendBody?.message || 'O serviço de e-mail recusou o envio.' }, 502);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from('orders')
      .update({
        nf_status: 'Enviada',
        nf_sent_at: now,
        nf_email_subject: subject,
        nf_email_message: message,
        updated_at: now,
      })
      .eq('id', orderId);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true, email: order.customer_email });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno ao enviar a NF.' }, 500);
  }
});
