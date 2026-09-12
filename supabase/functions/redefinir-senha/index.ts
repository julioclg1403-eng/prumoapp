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

// Restrito ao domínio real do app -- endpoint troca a senha de
// outra pessoa, então a resposta não deve poder ser lida por
// qualquer origem, mesmo com o Bearer token exigido abaixo.
const ORIGENS_PERMITIDAS = new Set([
  'https://prumoapp-kohl.vercel.app',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const permitida = origin && ORIGENS_PERMITIDAS.has(origin) ? origin : 'https://prumoapp-kohl.vercel.app'
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405, CORS)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401, CORS)

  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401, CORS)

  const perfilChamador = await admin.from('profiles')
    .select('role, organization_id')
    .eq('id', quemChama.data.user.id)
    .maybeSingle()

  if (!perfilChamador.data || perfilChamador.data.role !== 'admin') {
    return json({ erro: 'Só admin pode redefinir a senha de outra pessoa.' }, 403, CORS)
  }

  let corpo: { userId?: string; novaSenha?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400, CORS)
  }
  const { userId, novaSenha } = corpo
  if (!userId || !novaSenha || novaSenha.length < 8) {
    return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400, CORS)
  }

  const alvo = await admin.from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()
  if (!alvo.data || alvo.data.organization_id !== perfilChamador.data.organization_id) {
    return json({ erro: 'Usuário não encontrado.' }, 404, CORS)
  }

  const r = await admin.auth.admin.updateUserById(userId, { password: novaSenha })
  if (r.error) {
    console.error('[redefinir-senha]', r.error)
    return json({ erro: 'Não consegui redefinir a senha agora.' }, 500, CORS)
  }

  return json({ ok: true }, 200, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
