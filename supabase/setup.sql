-- Execute uma vez no SQL Editor do projeto Supabase.
-- Credenciais ficam criptografadas no payload; somente a API Nest acessa esta tabela.
create table if not exists public.affiliate_records (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('product','channel','job','click','settings')),
  version integer not null default 0 check (version >= 0),
  data jsonb not null
);
create index if not exists affiliate_records_owner_kind on public.affiliate_records(owner,kind);
create index if not exists affiliate_records_jobs_due on public.affiliate_records ((data->>'state'),(data->>'due')) where kind='job';
alter table public.affiliate_records enable row level security;
-- Sem políticas públicas: inclusive usuários autenticados usam a API, que verifica ownership.
revoke all on public.affiliate_records from anon, authenticated;
grant select, insert, update, delete on public.affiliate_records to service_role;
