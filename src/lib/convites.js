/* Convites: o administrador convida um e-mail, e a própria pessoa aceita.
   Ninguém vê nem puxa contas de quem não entrou. A trava está no banco. */
import { supabase } from './supabase'

export const listarConvites = () =>
  supabase.from('convites').select('id, email, role, worksite_id, expira_em')
    .is('aceito_em', null).order('criado_em', { ascending: false })

/* Convidar de novo o mesmo e-mail renova o convite. */
export async function convidar({ organizationId, email, papel, obraId }) {
  const limpo = email.trim().toLowerCase()
  const antigo = await supabase.from('convites').delete()
    .eq('organization_id', organizationId).eq('email', limpo).is('aceito_em', null)
  if (antigo.error) return antigo
  return supabase.from('convites')
    .insert({ organization_id: organizationId, email: limpo, role: papel, worksite_id: obraId || null })
}

export const cancelarConvite = (id) => supabase.from('convites').delete().eq('id', id)
export const meusConvites = () => supabase.rpc('meus_convites')
export const aceitarConvite = (id) => supabase.rpc('aceitar_convite', { p_convite: id })
