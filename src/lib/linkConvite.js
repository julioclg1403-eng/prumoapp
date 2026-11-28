/* Convite por link com liberação.

   O link leva só um código. Ele não dá acesso a nada: a pessoa pede
   para entrar, e quem libera é o administrador da empresa que criou
   o link. A trava está no banco. */
import { supabase } from './supabase'

const CHAVE = 'prumo.convite'
const FORMATO = /^[0-9a-f]{32}$/

/* O endereço do convite é ".../#convite=CODIGO". O código fica guardado
   no navegador para sobreviver ao cadastro e à confirmação do e-mail. */
export function lerLinkDoEndereco() {
  try {
    const achado = /^#convite=([0-9a-f]{32})$/.exec(window.location.hash)
    if (!achado) return false
    window.localStorage.setItem(CHAVE, achado[1])
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return true
  } catch { return false }
}

export function codigoGuardado() {
  try {
    const c = window.localStorage.getItem(CHAVE)
    return c && FORMATO.test(c) ? c : null
  } catch { return null }
}

export function esquecerCodigo() {
  try { window.localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
}

/* No celular, o link do e-mail de confirmação pode abrir em outro
   navegador. Por isso o código também vai junto do cadastro. */
export const codigoValido = (c) => (typeof c === 'string' && FORMATO.test(c) ? c : null)

// ── administrador ────────────────────────────────────────────
export const listarLinksAbertos = () =>
  supabase.from('links_convite').select('id, codigo, role, worksite_id, expira_em')
    .is('pedido_por', null).is('decisao', null).order('criado_em', { ascending: false })
export const criarLink = ({ papel, obraId }) =>
  supabase.rpc('criar_link_convite', { p_papel: papel, p_obra: obraId || null })
export const cancelarLink = (id) => supabase.from('links_convite').delete().eq('id', id)
export const pedidosDeEntrada = () => supabase.rpc('pedidos_de_entrada')
export const liberarPedido = (id) => supabase.rpc('liberar_pedido', { p_link: id })
export const recusarPedido = (id) => supabase.rpc('recusar_pedido', { p_link: id })

// ── quem recebeu o link ──────────────────────────────────────
export const verLink = (codigo) => supabase.rpc('ver_link_convite', { p_codigo: codigo })
export const pedirEntrada = (codigo) => supabase.rpc('pedir_entrada', { p_codigo: codigo })
export const meusPedidos = () => supabase.rpc('meus_pedidos')

// ── mensagens prontas para o WhatsApp ────────────────────────
const site = () => window.location.origin

export const enderecoDoConvite = (codigo) => `${site()}/#convite=${codigo}`

/* Sem número: o WhatsApp abre e a própria pessoa escolhe o contato.
   O app não pede nem guarda telefone de ninguém. */
export const abrirNoWhatsapp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`

export const mensagemDoConvite = ({ empresa, codigo, expiraEm }) => [
  `Convite para entrar no Prumo (${empresa}).`,
  '',
  `1. Abra: ${enderecoDoConvite(codigo)}`,
  '2. Crie a sua conta com o seu e-mail.',
  '3. Confirme pelo e-mail que vai chegar (olhe também no spam).',
  '4. Toque em "Pedir liberação".',
  '',
  `O link vale para uma pessoa, até ${new Date(expiraEm).toLocaleDateString('pt-BR')}.`,
].join('\n')

export const mensagemDeLiberado = ({ empresa }) =>
  `Seu acesso ao Prumo (${empresa}) foi liberado. Entre aqui: ${site()}/#entrar`

export const mensagemDeEspera = ({ empresa }) =>
  `Pedi para entrar no Prumo (${empresa}). Pode liberar em Usuários?`
