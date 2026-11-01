-- Gerencial Yacht: acesso SÓ do administrador + senha própria da aba.
-- Substitui a função gerencial_yacht_chave(text) da migração anterior (que deixava a gestão inteira entrar).
-- A senha é escolhida pelo admin na própria aba (nunca passa pelo código); no banco fica só o hash (bcrypt).
-- Cinco senhas erradas seguidas bloqueiam por 15 minutos.
-- Esqueceu a senha? No SQL Editor: update private.gerencial_acesso set senha_hash = null, tentativas = 0, bloqueado_ate = null;

create extension if not exists pgcrypto with schema extensions;

create table if not exists private.gerencial_acesso (
  id int primary key default 1 check (id = 1),
  senha_hash text,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table private.gerencial_acesso enable row level security;  -- sem políticas: só as funções abaixo mexem
insert into private.gerencial_acesso (id) values (1) on conflict (id) do nothing;

drop function if exists public.gerencial_yacht_chave(text);

-- Situação pra tela decidir o que mostrar (nunca devolve hash nem chave).
create or replace function public.gerencial_yacht_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_role text;
  v_def boolean;
  v_bloq timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('admin', false);
  end if;
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'admin' then
    return jsonb_build_object('admin', false);
  end if;
  select (a.senha_hash is not null), a.bloqueado_ate into v_def, v_bloq
    from private.gerencial_acesso a where a.id = 1;
  return jsonb_build_object('admin', true, 'senha_definida', coalesce(v_def, false), 'bloqueado', coalesce(v_bloq > now(), false));
end;
$$;

-- Cria a senha (1ª vez) ou troca (exige a atual).
create or replace function public.gerencial_yacht_definir_senha(p_nova text, p_atual text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_hash text;
begin
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is distinct from 'admin' then
    raise exception 'sem acesso' using errcode = '42501';
  end if;
  if p_nova is null or length(p_nova) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'curta');
  end if;
  select a.senha_hash into v_hash from private.gerencial_acesso a where a.id = 1 for update;
  if v_hash is not null and (p_atual is null or extensions.crypt(p_atual, v_hash) <> v_hash) then
    return jsonb_build_object('ok', false, 'motivo', 'atual');
  end if;
  update private.gerencial_acesso
     set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 10)),
         tentativas = 0, bloqueado_ate = null, atualizado_em = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- Entrega a chave do painel só pro admin que acertar a senha.
-- Erro de senha devolve resposta (não exceção) pra o contador de tentativas gravar.
create or replace function public.gerencial_yacht_chave(p_senha text, p_nome text default 'obra-yacht')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  a private.gerencial_acesso%rowtype;
  k record;
begin
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is distinct from 'admin' then
    raise exception 'sem acesso' using errcode = '42501';
  end if;

  select * into a from private.gerencial_acesso where id = 1 for update;
  if a.senha_hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_senha');
  end if;
  if a.bloqueado_ate is not null and a.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  if p_senha is null or extensions.crypt(p_senha, a.senha_hash) <> a.senha_hash then
    update private.gerencial_acesso
       set tentativas = tentativas + 1,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = 1;
    return jsonb_build_object('ok', false, 'motivo', 'senha', 'restantes', greatest(0, 4 - a.tentativas));
  end if;

  update private.gerencial_acesso set tentativas = 0, bloqueado_ate = null where id = 1;
  select g.chave, g.iv into k from private.gerencial_arquivos g where g.nome = p_nome;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sem_chave');
  end if;
  return jsonb_build_object('ok', true, 'chave', k.chave, 'iv', k.iv);
end;
$$;

revoke all on function public.gerencial_yacht_status() from public, anon;
revoke all on function public.gerencial_yacht_definir_senha(text, text) from public, anon;
revoke all on function public.gerencial_yacht_chave(text, text) from public, anon;
grant execute on function public.gerencial_yacht_status() to authenticated;
grant execute on function public.gerencial_yacht_definir_senha(text, text) to authenticated;
grant execute on function public.gerencial_yacht_chave(text, text) to authenticated;
