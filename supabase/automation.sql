-- Evolução aplicada no projeto pelo plugin Supabase.
alter table public.affiliate_records drop constraint affiliate_records_kind_check;
alter table public.affiliate_records add constraint affiliate_records_kind_check check (kind in ('product','channel','job','click','settings','workflow','run','candidate','seen','preferences'));
create index affiliate_workflow_due on public.affiliate_records ((data->>'enabled'),(data->>'nextRun')) where kind='workflow';
