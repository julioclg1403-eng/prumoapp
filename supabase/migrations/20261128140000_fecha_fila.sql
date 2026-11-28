-- Acaba a fila de contas sem empresa e faz a trava conferir de qual empresa é o administrador.

begin;

-- 1) Acaba a fila que qualquer administrador via.
drop policy if exists perfil_libera_aguardando on public.profiles;
drop policy if exists perfil_select_aguardando on public.profiles;

-- 2) A trava passa a conferir DE QUAL empresa é o administrador.
create or replace function private.protege_papel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  eu_papel text;
  eu_org   uuid;
begin
  /* Única forma de uma conta entrar numa empresa: abrir a própria
     (criar_minha_organizacao) ou aceitar um convite (aceitar_convite).
     As duas marcam, nesta transação, exatamente a empresa atribuída. */
  if old.organization_id is null
     and new.organization_id is not null
     and new.id = old.id
     and current_setting('prumo.cadastro', true) = new.organization_id::text then
    return new;
  end if;

  select role, organization_id into eu_papel, eu_org from public.profiles where id = auth.uid();

  if new.id is distinct from old.id then
    raise exception 'O identificador da conta não muda.';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A empresa da conta só muda ao aceitar um convite ou ao abrir a própria obra.';
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'O e-mail da conta não muda por aqui.';
  end if;
  if (new.role is distinct from old.role
      or new.modulos_permitidos is distinct from old.modulos_permitidos
      or new.obras_permitidas is distinct from old.obras_permitidas)
     and not (coalesce(eu_papel, '') = 'admin' and eu_org is not null and old.organization_id = eu_org) then
    raise exception 'Somente um administrador da própria empresa pode alterar o acesso.';
  end if;
  if new.worksite_id is distinct from old.worksite_id
     and new.worksite_id is not null
     and not exists (select 1 from public.worksites w
                     where w.id = new.worksite_id and w.organization_id = new.organization_id) then
    raise exception 'Essa obra não é da empresa da conta.';
  end if;
  return new;
end;
$$;

commit;
