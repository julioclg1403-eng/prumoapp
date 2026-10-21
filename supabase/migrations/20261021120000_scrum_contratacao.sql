-- Scrum · Fluxo de Contratação (aba Scrum dentro de Pendências).
-- Segue o briefing: tabelas de contratações e de itens, com quem marcou
-- cada item e quando. Leitura: qualquer pessoa da organização. Escrita:
-- gestão/admin (campo só acompanha).

create table if not exists public.scrum_contratacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worksite_id uuid not null references public.worksites(id) on delete cascade,
  nome text not null,
  inicio date not null,
  responsavel text,
  observacoes text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists scrum_contratacoes_obra_idx on public.scrum_contratacoes (worksite_id);

create table if not exists public.scrum_contratacao_itens (
  contratacao_id uuid not null references public.scrum_contratacoes(id) on delete cascade,
  chave text not null check (chave in ('i1','i2','i3','i4','i5','i6','i7a','i7b','i8','i9','i10','i11','i12','i13','i14','i15')),
  estado text not null check (estado in ('ok','na')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (contratacao_id, chave)
);

alter table public.scrum_contratacoes enable row level security;
alter table public.scrum_contratacao_itens enable row level security;

create policy scrum_contratacoes_select on public.scrum_contratacoes
  for select using (organization_id = private.minha_org());
create policy scrum_contratacoes_insert on public.scrum_contratacoes
  for insert with check (organization_id = private.minha_org() and private.eh_gestao());
create policy scrum_contratacoes_update on public.scrum_contratacoes
  for update using (organization_id = private.minha_org() and private.eh_gestao())
  with check (organization_id = private.minha_org());
create policy scrum_contratacoes_delete on public.scrum_contratacoes
  for delete using (organization_id = private.minha_org() and private.eh_gestao());

create policy scrum_itens_select on public.scrum_contratacao_itens
  for select using (organization_id = private.minha_org());
create policy scrum_itens_insert on public.scrum_contratacao_itens
  for insert with check (organization_id = private.minha_org() and private.eh_gestao());
create policy scrum_itens_update on public.scrum_contratacao_itens
  for update using (organization_id = private.minha_org() and private.eh_gestao())
  with check (organization_id = private.minha_org());
create policy scrum_itens_delete on public.scrum_contratacao_itens
  for delete using (organization_id = private.minha_org() and private.eh_gestao());
