/* Links de acesso: o convite (o administrador define nome, e-mail,
   perfil e obra; quem recebe só cria a senha) e a troca de senha
   liberada pelo administrador.

   O link é a chave (uso único, com prazo, cancelável). Quem cria a
   conta ou troca a senha é uma função no servidor, sempre na conta
   que o banco indica para aquele link. */
import { supabase } from './supabase'

const CHAVE = 'prumo.convite'
const FORMATO = /^[0-9a-f]{32}$/

/* O endereço é ".../#convite=CODIGO" ou ".../#senha=CODIGO". O código
   sai da barra de endereço e fica guardado até ser usado ou dispensado. */
export function lerLinkDoEndereco() {
  try {
    const achado = /^#(convite|senha)=([0-9a-f]{32})$/.exec(window.location.hash)
    if (!achado) return false
    window.localStorage.setItem(CHAVE, `${achado[1]}:${achado[2]}`)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return true
  } catch { return false }
}

export function linkGuardado() {
  try {
    const [tipo, codigo] = String(window.localStorage.getItem(CHAVE) || '').split(':')
    return (tipo === 'convite' || tipo === 'senha') && FORMATO.test(codigo || '') ? { tipo, codigo } : null
  } catch { return null }
}

export function esquecerLink() {
  try { window.localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
}

// ── quem recebeu o link ──────────────────────────────────────
export const verLink = (tipo, codigo) =>
  supabase.rpc(tipo === 'senha' ? 'ver_troca_senha' : 'ver_convite', { p_codigo: codigo })

export async function usarLink(tipo, codigo, senha) {
  const { data, error } = await supabase.functions.invoke('acesso-por-link', { body: { tipo, codigo, senha } })
  if (!error) return { email: data.email }
  // quando a função recusa, o motivo vem no corpo da resposta, guardado em error.context
  let corpo = null
  try { corpo = await error.context.json() } catch { /* sem resposta do servidor */ }
  return {
    erro: corpo?.erro || 'Não consegui falar com o servidor. Confira a internet e tente de novo.',
    situacao: corpo?.situacao,
  }
}

/* Sem login. A resposta é a mesma exista ou não a conta. */
export const pedirTroca = (email) => supabase.rpc('pedir_troca_senha', { p_email: email })

// ── administrador ────────────────────────────────────────────
export const criarConvite = ({ nome, email, papel, obraId }) =>
  supabase.rpc('criar_convite', { p_nome: nome, p_email: email, p_papel: papel, p_obra: obraId || null })

export const enderecoDoConvite = (codigo) => `${window.location.origin}/#convite=${codigo}`

/* Sem número: o WhatsApp abre e o administrador escolhe o contato.
   O app não pede nem guarda telefone de ninguém. */
export const abrirNoWhatsapp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`

export const quandoVence = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export const mensagemDoConvite = ({ nome, empresa, codigo, expiraEm }) => [
  `Olá, ${nome}! Este é o seu convite para o Prumo (${empresa}).`,
  '',
  `1. Abra: ${enderecoDoConvite(codigo)}`,
  '2. Crie a sua senha. Pronto, você já entra na obra.',
  '',
  `O link é só seu, não repasse. Vale uma vez, até ${quandoVence(expiraEm)}.`,
].join('\n')

export const trocasDeSenha = () => supabase.rpc('trocas_de_senha')
export const liberarTroca = (usuarioId) => supabase.rpc('liberar_troca_senha', { p_usuario: usuarioId })
export const cancelarTroca = (id) => supabase.rpc('cancelar_troca_senha', { p_id: id })

export const mensagemDaTroca = ({ nome, empresa, codigo, expiraEm }) => [
  `Olá, ${nome || ''}! A troca da sua senha do Prumo (${empresa}) foi liberada.`,
  '',
  `1. Abra: ${window.location.origin}/#senha=${codigo}`,
  '2. Crie a senha nova. Pronto, você já entra.',
  '',
  `O link é só seu, não repasse. Vale uma vez, até ${quandoVence(expiraEm)}.`,
].join('\n')

export const pedidoDeSenhaPorWhatsapp = 'Pedi uma senha nova no Prumo. Pode liberar em Usuários?'
