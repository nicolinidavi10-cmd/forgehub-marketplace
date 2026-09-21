-- ==========================================================
-- BRENNTAGHUB - SALDO INICIAL DO FINANCEIRO
-- Somente o proprietário (UID abaixo) pode alterar.
-- Rode DEPOIS dos SQLs atuais do projeto.
-- ==========================================================

begin;

create table if not exists public.finance_settings (
  id smallint primary key check (id = 1),
  initial_balance numeric(14,2) not null default 0 check (initial_balance >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.finance_settings (id, initial_balance)
values (1, 0)
on conflict (id) do nothing;

alter table public.finance_settings enable row level security;

drop policy if exists "finance_settings_read_authenticated" on public.finance_settings;
create policy "finance_settings_read_authenticated"
on public.finance_settings
for select
to authenticated
using (true);

revoke insert, update, delete on public.finance_settings from anon, authenticated;
grant select on public.finance_settings to authenticated;

create or replace function public.finance_get_initial_balance()
returns numeric(14,2)
language sql
security definer
stable
set search_path = public
as $$
  select initial_balance
  from public.finance_settings
  where id = 1;
$$;

grant execute on function public.finance_get_initial_balance() to authenticated;

create or replace function public.finance_set_initial_balance(p_initial_balance numeric)
returns numeric(14,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := '915bef33-abe4-4ce9-95e1-3745389bd9a4'::uuid;
  v_value numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if auth.uid() <> v_owner then
    raise exception 'Apenas o proprietário pode alterar o saldo inicial.';
  end if;

  if p_initial_balance is null or p_initial_balance < 0 then
    raise exception 'Saldo inicial inválido.';
  end if;

  v_value := round(p_initial_balance::numeric, 2);

  update public.finance_settings
  set initial_balance = v_value,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1;

  return v_value;
end;
$$;

grant execute on function public.finance_set_initial_balance(numeric) to authenticated;

commit;
