/* Convites: o administrador convida um e-mail, e a própria pessoa aceita.
   Ninguém vê nem puxa contas de quem não entrou. A trava está no banco. */
import { supabase } from './supabase'

export const listarConvites = () =>
  supabase.from('convites').select('id, email, role, worksite_id, expira_em')
    .is('aceito_em', null).order('criado_em', { ascending: false })

export const cancelarConvite = (id) => supabase.from('convites').delete().eq('id', id)
export const meusConvites = () => supabase.rpc('meus_convites')
export const aceitarConvite = (id) => supabase.rpc('aceitar_convite', { p_convite: id })
