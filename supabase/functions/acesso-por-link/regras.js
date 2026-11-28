/* O que a função "acesso-por-link" faz, separado do servidor para
   poder ser testado. Dois tipos de link: convite (cria o acesso) e
   troca de senha (liberada pelo administrador).

   Cuidados:
   - o e-mail e a conta vêm SEMPRE do banco, nunca de quem chama;
   - o convite só CRIA conta: se o e-mail já tem conta, para aqui;
   - a troca de senha só mexe na conta do link, que é gasto antes
     (dois toques não passam) e devolvido se a troca falhar;
   - a conta só é apagada se foi criada nesta mesma chamada e a
     ligação com a empresa falhou. */

export const SENHA_MINIMA = 8
const FORMATO_DO_CODIGO = /^[0-9a-f]{32}$/

const MOTIVOS = {
  convite: {
    usado: 'Este convite já foi usado. Se foi você, é só entrar com o seu e-mail e senha.',
    vencido: 'O convite venceu. Peça um novo ao administrador.',
    tem_conta: 'Este e-mail já tem conta no Prumo. Entre com a sua senha.',
    invalido: 'Este convite não vale. Peça um novo ao administrador.',
  },
  senha: {
    usado: 'Este link já foi usado. Entre com a senha que você criou.',
    vencido: 'Este link venceu. Peça ao administrador para liberar de novo.',
    invalido: 'Este link não vale. Peça ao administrador para liberar de novo.',
  },
}

const recusa = (tipo, situacao, status = 409) => ({
  status,
  corpo: { erro: MOTIVOS[tipo][situacao] || MOTIVOS[tipo].invalido, situacao: MOTIVOS[tipo][situacao] ? situacao : 'invalido' },
})
const falhou = { status: 500, corpo: { erro: 'Não consegui concluir agora. Tente de novo em instantes.' } }
const senhaRecusada = { status: 400, corpo: { erro: 'O servidor recusou essa senha. Use uma senha mais difícil.' } }
const eSenhaFraca = (erro) => erro.code === 'weak_password' || /password/i.test(erro.message || '')

async function criarAcesso(codigo, senha, admin, registrar) {
  const visto = await admin.rpc('ver_convite', { p_codigo: codigo })
  if (visto.error) { registrar('ver_convite', visto.error); return falhou }
  const convite = visto.data?.[0]
  if (!convite) return recusa('convite', 'invalido', 404)
  if (convite.situacao !== 'disponivel') return recusa('convite', convite.situacao)

  const criada = await admin.auth.admin.createUser({
    email: convite.email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: convite.nome },
    app_metadata: { entrou_por_convite: true },
  })
  if (criada.error) {
    if (criada.error.code === 'email_exists' || /already.*registered|already exists/i.test(criada.error.message || '')) {
      return recusa('convite', 'tem_conta')
    }
    if (eSenhaFraca(criada.error)) return senhaRecusada
    registrar('createUser', criada.error)
    return falhou
  }

  const id = criada.data.user.id
  const ligada = await admin.rpc('concluir_convite', { p_codigo: codigo, p_usuario: id })
  if (ligada.error) {
    registrar('concluir_convite', ligada.error)
    const apagada = await admin.auth.admin.deleteUser(id) // a conta que acabou de nascer, e só ela
    if (apagada.error) registrar('deleteUser', apagada.error)
    return falhou
  }

  return { status: 200, corpo: { ok: true, email: convite.email } }
}

async function trocarSenha(codigo, senha, admin, registrar) {
  const reserva = await admin.rpc('reservar_troca_senha', { p_codigo: codigo })
  if (reserva.error) { registrar('reservar_troca_senha', reserva.error); return falhou }
  const troca = reserva.data?.[0]
  if (!troca) {
    const visto = await admin.rpc('ver_troca_senha', { p_codigo: codigo })
    if (visto.error) { registrar('ver_troca_senha', visto.error); return falhou }
    const situacao = visto.data?.[0]?.situacao
    return recusa('senha', situacao || 'invalido', situacao ? 409 : 404)
  }

  const feita = await admin.auth.admin.updateUserById(troca.usuario, { password: senha })
  if (feita.error) {
    const volta = await admin.rpc('devolver_troca_senha', { p_id: troca.id })
    if (volta.error) registrar('devolver_troca_senha', volta.error)
    if (eSenhaFraca(feita.error)) return senhaRecusada
    registrar('updateUserById', feita.error)
    return falhou
  }

  return { status: 200, corpo: { ok: true, email: troca.email } }
}

/* admin: cliente do Supabase com a chave de serviço (só existe no servidor). */
export async function acessoPorLink(pedido, admin, registrar = () => {}) {
  const tipo = pedido?.tipo === 'senha' ? 'senha' : pedido?.tipo === 'convite' ? 'convite' : null
  const codigo = typeof pedido?.codigo === 'string' ? pedido.codigo : ''
  const senha = typeof pedido?.senha === 'string' ? pedido.senha : ''
  if (!tipo) return { status: 400, corpo: { erro: 'Pedido inválido.' } }
  if (!FORMATO_DO_CODIGO.test(codigo)) return recusa(tipo, 'invalido', 404)
  if (senha.length < SENHA_MINIMA || senha.length > 72) {
    return { status: 400, corpo: { erro: `A senha precisa ter de ${SENHA_MINIMA} a 72 caracteres.` } }
  }
  return (tipo === 'convite' ? criarAcesso : trocarSenha)(codigo, senha, admin, registrar)
}
