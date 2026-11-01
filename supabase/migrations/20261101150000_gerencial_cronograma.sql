-- Gerencial Yacht → Início: o cronograma já tratado pelo painel (sem as linhas duplicadas), usado pela
-- Linha de balanço do Início. SÓ cronograma (nenhum valor em dinheiro): por isso a gestão toda pode ler;
-- quem grava é o administrador, ao atualizar o Gerencial, pelo RPC abaixo.

create table if not exists public.gerencial_cronograma (
  worksite_id uuid primary key references public.worksites(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gerado_em text,       -- data em que a Prevision gerou a planilha (texto da própria planilha)
  origem text,          -- nome do arquivo que originou (ou "painel" quando veio embutido)
  tarefas jsonb not null,  -- [{ t: tarefa, l: local, g: disciplina, i, f: atual, bi, bf: base, ri, rf: real }]
  locais jsonb not null,   -- locais na ordem do eixo vertical (de baixo pra cima)
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

alter table public.gerencial_cronograma enable row level security;

create policy gerencial_cronograma_select on public.gerencial_cronograma
  for select using (organization_id = private.minha_org() and private.eh_gestao());
-- sem políticas de escrita: só o RPC (security definer) grava.

create or replace function public.gerencial_salvar_cronograma(
  p_worksite_id uuid, p_gerado_em text, p_origem text, p_tarefas jsonb, p_locais jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_org uuid;
begin
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is distinct from 'admin' then
    raise exception 'sem acesso' using errcode = '42501';
  end if;

  select w.organization_id into v_org
    from public.worksites w
   where w.id = p_worksite_id and w.organization_id = private.minha_org();
  if v_org is null then
    raise exception 'obra inválida' using errcode = '42501';
  end if;

  if jsonb_typeof(p_tarefas) <> 'array' or jsonb_array_length(p_tarefas) > 20000 then
    raise exception 'cronograma inválido';
  end if;

  insert into public.gerencial_cronograma
    (worksite_id, organization_id, gerado_em, origem, tarefas, locais, atualizado_por, atualizado_em)
  values
    (p_worksite_id, v_org, p_gerado_em, p_origem, p_tarefas, coalesce(p_locais, '[]'::jsonb), auth.uid(), now())
  on conflict (worksite_id) do update
    set gerado_em = excluded.gerado_em, origem = excluded.origem, tarefas = excluded.tarefas,
        locais = excluded.locais, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$$;

revoke all on function public.gerencial_salvar_cronograma(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.gerencial_salvar_cronograma(uuid, text, text, jsonb, jsonb) to authenticated;
