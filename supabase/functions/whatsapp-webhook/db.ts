// ============================================================
// Acesso ao banco, com a service role (ignora RLS -- é o próprio
// sistema gravando, não um usuário logado pelo app).
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

export async function organizacao() {
  const { data } = await supabase.from('organizations').select('*').limit(1).maybeSingle()
  return data
}

// Acha o contato pelo telefone; cria um registro "não vinculado"
// (profile_id null) se for a primeira vez que esse número escreve.
// Só um admin vinculando pelo app (fora do escopo desta função) dá
// a um número a permissão de virar registro de verdade.
export async function contatoPorTelefone(organizationId: string, telefone: string, nomeWhatsapp: string | null) {
  const existente = await supabase
    .from('whatsapp_contacts')
    .select('*, perfil:profiles(*)')
    .eq('organization_id', organizationId)
    .eq('telefone', telefone)
    .maybeSingle()
  if (existente.data) return existente.data

  const criado = await supabase
    .from('whatsapp_contacts')
    .insert({ organization_id: organizationId, telefone, nome_whatsapp: nomeWhatsapp })
    .select('*, perfil:profiles(*)')
    .single()
  return criado.data
}

// O que a IA precisa para casar texto solto ("laje do 3 andar") com
// cadastro de verdade -- só da obra de quem mandou a mensagem.
export async function contextoDaObra(worksiteId: string) {
  const [locais, servicos] = await Promise.all([
    supabase.from('locations').select('id, nome').eq('worksite_id', worksiteId).eq('ativo', true),
    supabase.from('services').select('id, nome').eq('worksite_id', worksiteId).eq('ativo', true),
  ])
  return { locais: locais.data || [], servicos: servicos.data || [] }
}

export async function registrarMensagem(linha: Record<string, unknown>) {
  const { data } = await supabase.from('whatsapp_messages').insert(linha).select('*').single()
  return data
}

export async function atualizarMensagem(id: string, mudanca: Record<string, unknown>) {
  await supabase.from('whatsapp_messages').update(mudanca).eq('id', id)
}
