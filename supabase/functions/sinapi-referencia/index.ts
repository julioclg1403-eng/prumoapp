// ============================================================
// DESATIVADA -- migrada de volta pro prumo-chat (Anthropic) numa
// sessao anterior por qualidade dos dados; o codigo-fonte tinha sido
// removido do repositorio (git revert), mas o deploy continuava no
// ar chamando a OpenAI. Auditoria de seguranca (2026-09-12) pediu
// pra fechar essa superficie orfa em vez de deixar rodando sem
// ninguem revisando. Sem chave de API nenhuma, sem chamada externa.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(() => new Response(JSON.stringify({ erro: 'Esta função foi desativada.' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
