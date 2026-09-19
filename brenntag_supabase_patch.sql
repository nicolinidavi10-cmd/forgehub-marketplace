-- ==========================================================
-- BRENNTAG - PATCH DE SEGURANÇA E FLUXOS DO SITE
-- Rode DEPOIS do SQL principal que já foi executado.
-- ==========================================================

begin;

-- ----------------------------------------------------------
-- PROFILES: comprador pode criar/editar o próprio perfil,
-- mas nunca pode se promover a admin.
-- ----------------------------------------------------------

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'customer'
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() and role = 'customer')
with check (id = auth.uid() and role = 'customer');

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ----------------------------------------------------------
-- PERMISSÕES Data API
-- ----------------------------------------------------------

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant insert, update, delete on public.orders to authenticated;
grant insert, update, delete on public.order_items to authenticated;
grant select on public.purchase_terms to anon, authenticated;
grant insert, update on public.purchase_terms to authenticated;
grant select, insert, delete on public.expenses to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ----------------------------------------------------------
-- Finalizar pedido: usa preço e estoque do banco.
-- ----------------------------------------------------------

create or replace function public.create_order(
  p_items jsonb,
  p_terms_version integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_name text;
  v_price numeric(12,2);
  v_stock integer;
  v_terms text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select content into v_terms
  from public.purchase_terms
  where version = p_terms_version and active = true
  limit 1;

  if v_terms is null then
    raise exception 'Os termos de compra não estão mais disponíveis. Recarregue a página.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho está vazio.';
  end if;

  insert into public.orders (
    customer_id,
    status,
    total,
    terms_version,
    terms_snapshot
  )
  values (
    auth.uid(),
    'Recebido',
    0,
    p_terms_version,
    v_terms
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantidade inválida.';
    end if;

    select name, price, stock
    into v_name, v_price, v_stock
    from public.products
    where id = v_product_id and active = true
    for update;

    if not found then
      raise exception 'Produto não encontrado.';
    end if;

    if v_stock < v_quantity then
      raise exception 'Estoque insuficiente para "%". Disponível: %, solicitado: %.', v_name, v_stock, v_quantity;
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price
    ) values (
      v_order_id, v_product_id, v_name, v_quantity, v_price
    );

    update public.products
    set stock = stock - v_quantity,
        updated_at = now()
    where id = v_product_id;

    v_total := v_total + (v_price * v_quantity);
  end loop;

  update public.orders
  set total = v_total,
      updated_at = now()
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- ----------------------------------------------------------
-- Cancelamento pelo comprador ou admin.
-- ----------------------------------------------------------

create or replace function public.cancel_order(p_order_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_status public.order_status;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select customer_id, status
  into v_customer_id, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_customer_id <> auth.uid() and not public.is_admin() then
    raise exception 'Você não pode cancelar este pedido.';
  end if;

  if v_status = 'Cancelado' then
    return true;
  end if;

  if not public.is_admin() and v_status not in ('Recebido','Em separação') then
    raise exception 'Este pedido não pode mais ser cancelado nesta etapa.';
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    update public.products
    set stock = stock + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  update public.orders
  set status = 'Cancelado',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      updated_at = now()
  where id = p_order_id;

  return true;
end;
$$;

-- ----------------------------------------------------------
-- Admin: mudar status com devolução/baixa de estoque.
-- ----------------------------------------------------------

create or replace function public.admin_update_order_status(
  p_order_id bigint,
  p_new_status public.order_status
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_item record;
  v_product_stock integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar o status.';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_status = p_new_status then
    return true;
  end if;

  if p_new_status = 'Cancelado' and v_status <> 'Cancelado' then
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id loop
      update public.products
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id;
    end loop;

    update public.orders
    set status = 'Cancelado',
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        updated_at = now()
    where id = p_order_id;

    return true;
  end if;

  if v_status = 'Cancelado' and p_new_status <> 'Cancelado' then
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id loop
      select stock into v_product_stock
      from public.products
      where id = v_item.product_id
      for update;

      if v_product_stock is null or v_product_stock < v_item.quantity then
        raise exception 'Não há estoque suficiente para reativar este pedido.';
      end if;

      update public.products
      set stock = stock - v_item.quantity,
          updated_at = now()
      where id = v_item.product_id;
    end loop;
  end if;

  update public.orders
  set status = p_new_status,
      cancelled_by = case when p_new_status = 'Cancelado' then auth.uid() else cancelled_by end,
      cancelled_at = case when p_new_status = 'Cancelado' then now() else cancelled_at end,
      updated_at = now()
  where id = p_order_id;

  return true;
end;
$$;

-- ----------------------------------------------------------
-- Admin: excluir pedido sem deixar estoque preso.
-- ----------------------------------------------------------

create or replace function public.admin_delete_order(p_order_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_item record;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir pedidos.';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_status <> 'Cancelado' then
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id loop
      update public.products
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id;
    end loop;
  end if;

  delete from public.orders where id = p_order_id;
  return true;
end;
$$;

-- ----------------------------------------------------------
-- Admin: nova versão dos termos.
-- ----------------------------------------------------------

create or replace function public.save_purchase_terms(
  p_title text,
  p_content text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem editar os termos.';
  end if;

  if trim(coalesce(p_title,'')) = '' or trim(coalesce(p_content,'')) = '' then
    raise exception 'Título e conteúdo são obrigatórios.';
  end if;

  select coalesce(max(version),0) + 1 into v_version
  from public.purchase_terms;

  insert into public.purchase_terms (
    version,
    title,
    content,
    active,
    created_by
  ) values (
    v_version,
    trim(p_title),
    trim(p_content),
    true,
    auth.uid()
  );

  return v_version;
end;
$$;

-- Funções não devem ser chamadas por visitantes anônimos.
revoke execute on function public.create_order(jsonb, integer) from anon;
revoke execute on function public.cancel_order(bigint) from anon;
revoke execute on function public.admin_update_order_status(bigint, public.order_status) from anon;
revoke execute on function public.admin_delete_order(bigint) from anon;
revoke execute on function public.save_purchase_terms(text, text) from anon;

grant execute on function public.create_order(jsonb, integer) to authenticated;
grant execute on function public.cancel_order(bigint) to authenticated;
grant execute on function public.admin_update_order_status(bigint, public.order_status) to authenticated;
grant execute on function public.admin_delete_order(bigint) to authenticated;
grant execute on function public.save_purchase_terms(text, text) to authenticated;

-- ----------------------------------------------------------
-- Realtime para produtos e pedidos.
-- Se já estiverem na publicação, o bloco simplesmente ignora.
-- ----------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
end;
$$;

commit;

-- Atualiza imediatamente a Data API para enxergar as funções novas.
notify pgrst, 'reload schema';

-- ==========================================================
-- ATENDIMENTO COMERCIAL — INSTALAÇÃO LIMPA
-- ==========================================================
-- Este bloco recria SOMENTE as tabelas de atendimento. Isso evita
-- conflitos com versões antigas dessas tabelas que possam ter outro
-- tipo de ID/colunas. Pedidos, produtos e perfis não são afetados.

drop function if exists public.create_support_attendance(text,text,text,text,text,uuid);
drop function if exists public.create_support_attendance(text,text,text,text,uuid);
drop function if exists public.add_support_message(uuid,uuid,text,text);
drop function if exists public.get_support_messages(uuid,uuid);
drop function if exists public.admin_reply_support(uuid,text);
drop function if exists public.admin_update_support_status(uuid,text);
drop table if exists public.support_messages cascade;
drop table if exists public.support_attendances cascade;

create table public.support_attendances (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  client_token uuid not null unique,
  client_type text not null check (client_type in ('Pessoa Física','Pessoa Jurídica')),
  full_name text not null,
  email text not null,
  document text not null,
  status text not null default 'Aguardando admin' check (status in ('Aguardando admin','Em atendimento','Aguardando cliente','Encerrado')),
  admin_id uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  first_admin_reply_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz not null default now()
);

create table public.support_messages (
  id bigint generated by default as identity primary key,
  attendance_id uuid not null references public.support_attendances(id) on delete cascade,
  sender text not null check (sender in ('client','assistant','admin')),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index support_attendances_last_message_idx on public.support_attendances(last_message_at desc);
create index support_messages_attendance_idx on public.support_messages(attendance_id, created_at);

alter table public.support_attendances enable row level security;
alter table public.support_messages enable row level security;

create policy "support_admin_attendances" on public.support_attendances
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "support_admin_messages" on public.support_messages
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.support_attendances, public.support_messages to authenticated;
grant insert, update on public.support_messages to authenticated;


-- Função principal do novo atendimento. O nome é exclusivo para evitar conflitos
-- com versões antigas que possam estar no cache da Data API.
create or replace function public.open_brenntag_support(
  p_client_type text,
  p_full_name text,
  p_email text,
  p_document text,
  p_client_token uuid
)
returns table(attendance_id uuid, protocol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_protocol text;
begin
  if p_client_type not in ('Pessoa Física','Pessoa Jurídica') then
    raise exception 'Tipo de cliente inválido.';
  end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'Nome completo obrigatório.'; end if;
  if nullif(trim(p_email),'') is null then raise exception 'E-mail obrigatório.'; end if;
  if nullif(trim(p_document),'') is null then raise exception 'CPF/CNPJ obrigatório.'; end if;
  if p_client_token is null then raise exception 'Token do atendimento inválido.'; end if;

  v_protocol := 'ATD-' || to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD') || '-' || lpad((floor(random()*9000)+1000)::int::text,4,'0');

  insert into public.support_attendances
    (client_token, client_type, full_name, email, document, protocol)
  values
    (p_client_token, trim(p_client_type), trim(p_full_name), lower(trim(p_email)), trim(p_document), v_protocol)
  returning id, support_attendances.protocol into v_id, v_protocol;

  insert into public.support_messages(attendance_id,sender,message) values
    (v_id,'assistant','Olá! Seja bem-vindo ao atendimento comercial da BRENNTAG.'),
    (v_id,'assistant','Antes de começarmos, preciso de alguns dados para registrar seu atendimento.');

  return query select v_id, v_protocol;
exception
  when unique_violation then
    raise exception 'Já existe um atendimento com este protocolo ou token. Feche e abra um novo atendimento e tente novamente.';
end;
$$;

revoke all on function public.open_brenntag_support(text,text,text,text,uuid) from public;
grant execute on function public.open_brenntag_support(text,text,text,text,uuid) to anon, authenticated;

create or replace function public.create_support_attendance(
  p_client_type text,
  p_full_name text,
  p_email text,
  p_document text,
  p_client_token uuid
)
returns table(attendance_id uuid, protocol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_protocol text;
  v_try integer := 0;
begin
  if p_client_type not in ('Pessoa Física','Pessoa Jurídica') then
    raise exception 'Tipo de cliente inválido.';
  end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'Nome completo obrigatório.'; end if;
  if nullif(trim(p_email),'') is null then raise exception 'E-mail obrigatório.'; end if;
  if nullif(trim(p_document),'') is null then raise exception 'CPF/CNPJ obrigatório.'; end if;
  if p_client_token is null then raise exception 'Token do atendimento inválido.'; end if;

  loop
    v_try := v_try + 1;
    v_protocol := 'ATD-' || to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD') || '-' || lpad((floor(random()*9000)+1000)::int::text,4,'0');
    begin
      insert into public.support_attendances(client_token,client_type,full_name,email,document,protocol)
      values(p_client_token,p_client_type,trim(p_full_name),lower(trim(p_email)),trim(p_document),v_protocol)
      returning id, support_attendances.protocol into v_id, v_protocol;
      exit;
    exception when unique_violation then
      if v_try >= 10 then raise; end if;
    end;
  end loop;

  insert into public.support_messages(attendance_id,sender,message) values
    (v_id,'assistant','Olá! Seja bem-vindo ao atendimento comercial da BRENNTAG.'),
    (v_id,'assistant','Antes de começarmos, preciso de alguns dados para registrar seu atendimento.'),
    (v_id,'assistant','Seu atendimento foi registrado e já está pronto para continuar.');

  return query select v_id, v_protocol;
end;
$$;

revoke all on function public.create_support_attendance(text,text,text,text,uuid) from public;
grant execute on function public.create_support_attendance(text,text,text,text,uuid) to anon, authenticated;

create or replace function public.add_support_message(
  p_client_token uuid,
  p_attendance_id uuid,
  p_sender text,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_sender not in ('client','assistant') then raise exception 'Remetente inválido.'; end if;
  if trim(coalesce(p_message,'')) = '' then raise exception 'Mensagem vazia.'; end if;
  if not exists(select 1 from public.support_attendances where id=p_attendance_id and client_token=p_client_token) then raise exception 'Atendimento não encontrado.'; end if;
  insert into public.support_messages(attendance_id,sender,message) values(p_attendance_id,p_sender,trim(p_message));
  update public.support_attendances set last_message_at=now(), status=case when p_sender='client' then 'Aguardando admin' else status end where id=p_attendance_id;
  return true;
end;
$$;
grant execute on function public.add_support_message(uuid,uuid,text,text) to anon, authenticated;

create or replace function public.get_support_messages(p_client_token uuid, p_attendance_id uuid)
returns table(id bigint,sender text,message text,created_at timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
  select m.id,m.sender,m.message,m.created_at
  from public.support_messages m
  join public.support_attendances a on a.id=m.attendance_id
  where a.id=p_attendance_id and a.client_token=p_client_token
  order by m.created_at asc, m.id asc;
$$;
grant execute on function public.get_support_messages(uuid,uuid) to anon, authenticated;

create or replace function public.admin_reply_support(p_attendance_id uuid,p_message text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem responder atendimentos.'; end if;
  if trim(coalesce(p_message,''))='' then raise exception 'Digite uma mensagem.'; end if;
  insert into public.support_messages(attendance_id,sender,message) values(p_attendance_id,'admin',trim(p_message));
  update public.support_attendances set status='Aguardando cliente', admin_id=auth.uid(), first_admin_reply_at=coalesce(first_admin_reply_at,now()), last_message_at=now() where id=p_attendance_id;
  return true;
end;
$$;
grant execute on function public.admin_reply_support(uuid,text) to authenticated;

create or replace function public.client_finalize_support(p_client_token uuid, p_attendance_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_client_token is null or p_attendance_id is null then
    raise exception 'Atendimento inválido.';
  end if;
  update public.support_attendances
  set status='Encerrado',
      closed_at=now(),
      last_message_at=now()
  where id=p_attendance_id
    and client_token=p_client_token
    and status <> 'Encerrado';
  if not found then
    if exists(select 1 from public.support_attendances where id=p_attendance_id and client_token=p_client_token and status='Encerrado') then
      return true;
    end if;
    raise exception 'Atendimento não encontrado.';
  end if;
  return true;
end;
$$;
grant execute on function public.client_finalize_support(uuid,uuid) to anon, authenticated;

create or replace function public.admin_update_support_status(p_attendance_id uuid,p_status text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem alterar atendimentos.'; end if;
  if p_status not in ('Aguardando admin','Em atendimento','Aguardando cliente','Encerrado') then raise exception 'Status inválido.'; end if;
  update public.support_attendances set status=p_status, closed_at=case when p_status='Encerrado' then now() else null end, last_message_at=now() where id=p_attendance_id;
  return true;
end;
$$;
grant execute on function public.admin_update_support_status(uuid,text) to authenticated;

create or replace function public.admin_delete_support_attendance(p_attendance_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem excluir atendimentos.'; end if;
  select status into v_status from public.support_attendances where id=p_attendance_id;
  if v_status is null then raise exception 'Atendimento não encontrado.'; end if;
  if v_status <> 'Encerrado' then raise exception 'Somente atendimentos encerrados podem ser excluídos.'; end if;
  delete from public.support_messages where attendance_id=p_attendance_id;
  delete from public.support_attendances where id=p_attendance_id;
  return true;
end;
$$;
grant execute on function public.admin_delete_support_attendance(uuid) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.support_attendances; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.support_messages; exception when duplicate_object then null; end;
end $$;

commit;

-- Recarrega a Data API após instalar as funções de atendimento.
notify pgrst, 'reload schema';


-- ==========================================================
-- CUPONS DE DESCONTO — BLOCO INDEPENDENTE
-- Não altera/recria public.create_order.
-- ==========================================================

alter table public.orders
  add column if not exists subtotal numeric(12,2),
  add column if not exists coupon_code text,
  add column if not exists discount_percent numeric(5,2),
  add column if not exists discount_amount numeric(12,2);

create table if not exists public.discount_coupons (
  id bigint generated by default as identity primary key,
  code text not null unique,
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  active boolean not null default true,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists discount_coupons_code_upper_idx
  on public.discount_coupons (upper(code));

alter table public.discount_coupons enable row level security;

drop policy if exists "discount_coupons_admin_select" on public.discount_coupons;
drop policy if exists "discount_coupons_admin_write" on public.discount_coupons;

create policy "discount_coupons_admin_select"
on public.discount_coupons
for select to authenticated
using (public.is_admin());

create policy "discount_coupons_admin_write"
on public.discount_coupons
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.discount_coupons to authenticated;
grant usage, select on sequence public.discount_coupons_id_seq to authenticated;

create or replace function public.admin_save_discount_coupon(
  p_id bigint default null,
  p_code text default null,
  p_discount_percent numeric default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null,
  p_active boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem gerenciar cupons.';
  end if;

  v_code := upper(trim(coalesce(p_code,'')));

  if v_code = '' then raise exception 'Informe o código do cupom.'; end if;
  if v_code !~ '^[A-Z0-9_-]{3,40}$' then
    raise exception 'O código deve ter de 3 a 40 caracteres usando letras, números, hífen ou sublinhado.';
  end if;
  if p_discount_percent is null or p_discount_percent <= 0 or p_discount_percent > 100 then
    raise exception 'O desconto deve estar entre 0,01%% e 100%%.';
  end if;
  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'O limite de usos deve ser maior que zero.';
  end if;

  if p_id is null then
    insert into public.discount_coupons
      (code, discount_percent, active, expires_at, max_uses, created_by, updated_at)
    values
      (v_code, round(p_discount_percent,2), coalesce(p_active,true), p_expires_at, p_max_uses, auth.uid(), now())
    returning id into v_id;
  else
    update public.discount_coupons
    set code=v_code,
        discount_percent=round(p_discount_percent,2),
        active=coalesce(p_active,true),
        expires_at=p_expires_at,
        max_uses=p_max_uses,
        updated_at=now()
    where id=p_id
    returning id into v_id;

    if v_id is null then raise exception 'Cupom não encontrado.'; end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um cupom com esse código.';
end;
$$;

create or replace function public.admin_delete_discount_coupon(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem excluir cupons.'; end if;
  delete from public.discount_coupons where id=p_id;
  if not found then raise exception 'Cupom não encontrado.'; end if;
  return true;
end;
$$;

create or replace function public.preview_discount_coupon(
  p_code text,
  p_subtotal numeric
)
returns table(
  code text,
  discount_percent numeric,
  discount_amount numeric,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.discount_coupons%rowtype;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
begin
  v_subtotal := round(greatest(coalesce(p_subtotal,0),0),2);
  if v_subtotal <= 0 then raise exception 'Subtotal inválido.'; end if;

  select * into v_coupon
  from public.discount_coupons
  where upper(code)=upper(trim(coalesce(p_code,'')))
  limit 1;

  if not found then raise exception 'Cupom não encontrado.'; end if;
  if not v_coupon.active then raise exception 'Este cupom está desativado.'; end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then raise exception 'Este cupom expirou.'; end if;
  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then raise exception 'Este cupom atingiu o limite de usos.'; end if;

  v_discount := round(v_subtotal * v_coupon.discount_percent / 100, 2);

  return query select upper(v_coupon.code), v_coupon.discount_percent, v_discount, round(v_subtotal-v_discount,2);
end;
$$;

create or replace function public.apply_discount_coupon(
  p_order_id bigint,
  p_code text
)
returns table(
  coupon_code text,
  discount_percent numeric,
  subtotal numeric,
  discount_amount numeric,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.discount_coupons%rowtype;
  v_customer uuid;
  v_status public.order_status;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_total numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select o.customer_id, o.status, o.coupon_code
  into v_customer, v_status, coupon_code
  from public.orders as o
  where o.id=p_order_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_customer <> auth.uid() then raise exception 'Você não pode aplicar cupom neste pedido.'; end if;
  if v_status='Cancelado' then raise exception 'Este pedido já foi cancelado.'; end if;
  if coupon_code is not null then raise exception 'Este pedido já possui um cupom aplicado.'; end if;

  select * into v_coupon
  from public.discount_coupons
  where upper(code)=upper(trim(coalesce(p_code,'')))
  for update;

  if not found then raise exception 'Cupom não encontrado.'; end if;
  if not v_coupon.active then raise exception 'Este cupom está desativado.'; end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then raise exception 'Este cupom expirou.'; end if;
  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then raise exception 'Este cupom atingiu o limite de usos.'; end if;

  select round(coalesce(sum(quantity * unit_price),0),2)
  into v_subtotal
  from public.order_items
  where order_id=p_order_id;

  if v_subtotal <= 0 then raise exception 'Não foi possível calcular o subtotal do pedido.'; end if;

  v_discount := round(v_subtotal * v_coupon.discount_percent / 100,2);
  v_total := round(v_subtotal-v_discount,2);

  update public.orders
  set subtotal=v_subtotal,
      coupon_code=upper(v_coupon.code),
      discount_percent=v_coupon.discount_percent,
      discount_amount=v_discount,
      total=v_total,
      updated_at=now()
  where id=p_order_id;

  update public.discount_coupons
  set uses_count=uses_count+1, updated_at=now()
  where id=v_coupon.id;

  return query
    select upper(v_coupon.code), v_coupon.discount_percent, v_subtotal, v_discount, v_total;
end;
$$;

revoke all on function public.admin_save_discount_coupon(bigint,text,numeric,timestamptz,integer,boolean) from public;
revoke all on function public.admin_delete_discount_coupon(bigint) from public;
revoke all on function public.preview_discount_coupon(text,numeric) from public;
revoke all on function public.apply_discount_coupon(bigint,text) from public;

grant execute on function public.admin_save_discount_coupon(bigint,text,numeric,timestamptz,integer,boolean) to authenticated;
grant execute on function public.admin_delete_discount_coupon(bigint) to authenticated;
grant execute on function public.preview_discount_coupon(text,numeric) to authenticated;
grant execute on function public.apply_discount_coupon(bigint,text) to authenticated;

notify pgrst, 'reload schema';

