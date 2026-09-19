-- ==========================================================
-- NOTAS FISCAIS / DOCUMENTOS DE VENDA — BLOCO INDEPENDENTE
-- Não recria public.create_order.
-- ==========================================================

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists nf_status text not null default 'Pendente',
  add column if not exists nf_storage_path text,
  add column if not exists nf_file_name text,
  add column if not exists nf_reviewed_at timestamptz,
  add column if not exists nf_sent_at timestamptz,
  add column if not exists nf_email_subject text,
  add column if not exists nf_email_message text;

update public.orders
set nf_status = coalesce(nullif(nf_status,''), 'Pendente')
where nf_status is null or nf_status='';

create or replace function public.fill_order_customer_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_email is null or trim(new.customer_email) = '' then
    new.customer_email := auth.email();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_order_customer_email on public.orders;
create trigger trg_fill_order_customer_email
before insert on public.orders
for each row execute function public.fill_order_customer_email();

create index if not exists orders_nf_status_idx on public.orders(nf_status);

-- Bucket privado para os PDFs das NFs.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists "invoices_admin_select" on storage.objects;
drop policy if exists "invoices_customer_select_own" on storage.objects;
drop policy if exists "invoices_customer_insert_own" on storage.objects;
drop policy if exists "invoices_admin_insert" on storage.objects;
drop policy if exists "invoices_admin_update" on storage.objects;
drop policy if exists "invoices_admin_delete" on storage.objects;

create policy "invoices_admin_select"
on storage.objects for select to authenticated
using (bucket_id='invoices' and public.is_admin());

create policy "invoices_customer_select_own"
on storage.objects for select to authenticated
using (
  bucket_id='invoices'
  and split_part(name,'/',1)=auth.uid()::text
);

create policy "invoices_customer_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id='invoices'
  and split_part(name,'/',1)=auth.uid()::text
  and exists (
    select 1
    from public.orders o
    where o.id = nullif(split_part(name,'/',2),'')::bigint
      and o.customer_id = auth.uid()
  )
);

create policy "invoices_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id='invoices' and public.is_admin());

create policy "invoices_admin_update"
on storage.objects for update to authenticated
using (bucket_id='invoices' and public.is_admin())
with check (bucket_id='invoices' and public.is_admin());

create policy "invoices_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id='invoices' and public.is_admin());

grant select on public.orders to authenticated;
grant update on public.orders to authenticated;


create or replace function public.admin_review_invoice(
  p_order_id bigint,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem revisar a NF.';
  end if;

  if p_status not in ('Pendente','Aprovada') then
    raise exception 'Status de NF inválido.';
  end if;

  if p_status='Aprovada' then
    update public.orders
    set nf_status='Aprovada',
        nf_reviewed_at=now(),
        updated_at=now()
    where id=p_order_id
      and nf_storage_path is not null;
  else
    update public.orders
    set nf_status='Pendente',
        nf_reviewed_at=null,
        updated_at=now()
    where id=p_order_id;
  end if;

  if not found then
    raise exception 'Pedido não encontrado ou a NF ainda não foi anexada.';
  end if;

  return true;
end;
$$;

grant execute on function public.admin_review_invoice(bigint,text) to authenticated;

notify pgrst, 'reload schema';
