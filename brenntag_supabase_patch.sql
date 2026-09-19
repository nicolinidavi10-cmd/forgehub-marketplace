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
