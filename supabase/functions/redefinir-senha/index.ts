// ============================================================
// REDEFINIR SENHA — só admin, sem depender de e-mail.
//
// A chave mestra do Supabase (service role) nunca sai daqui — é
// exatamente o motivo pelo qual este app não tem "convidar por
// e-mail" (ver comentário em src/screens/usuarios.jsx). Esta função
// existe pra abrir uma exceção segura e estreita: só troca senha,
// só quando quem pede é admin da mesma organização do alvo.
//
// verify_jwt (padrão do projeto) já garante que só chega aqui quem
// está autenticado no Prumo — o resto (checar que é admin, checar
// que o alvo é da mesma organização) é feito na mão abaixo.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401)

  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401)

  const perfilChamador = await admin.from('profiles')
    .select('role, organization_id')
    .eq('id', quemChama.data.user.id)
    .maybeSingle()

  if (!perfilChamador.data || perfilChamador.data.role !== 'admin') {
    return json({ erro: 'Só admin pode redefinir a senha de outra pessoa.' }, 403)
  }

  let corpo: { userId?: string; novaSenha?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400)
  }
  const { userId, novaSenha } = corpo
  if (!userId || !novaSenha || novaSenha.length < 6) {
    return json({ erro: 'Dados inválidos.' }, 400)
  }

  const alvo = await admin.from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()
  if (!alvo.data || alvo.data.organization_id !== perfilChamador.data.organization_id) {
    return json({ erro: 'Usuário não encontrado.' }, 404)
  }

  const r = await admin.auth.admin.updateUserById(userId, { password: novaSenha })
  if (r.error) {
    console.error('[redefinir-senha]', r.error)
    return json({ erro: 'Não consegui redefinir a senha agora.' }, 500)
  }

  return json({ ok: true })
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
