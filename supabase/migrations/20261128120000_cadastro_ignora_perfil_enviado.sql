-- JÁ APLICADO no banco em 28/11/2026. Guardado aqui para não se perder se o banco for recriado.
-- A conta nova não aceita mais perfil, empresa ou obra enviados no cadastro.
-- (O supabase-seed.sql dependia do comportamento antigo.)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, nome, email, cargo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'cargo', '')
  );
  return new;
end;
$$;
