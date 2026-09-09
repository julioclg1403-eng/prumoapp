/* ============================================================
   Melhorar texto com IA — pro botão que aparece em campos de texto
   livre onde vale deixar a redação mais técnica (Descrição e
   Comentários de Projetos, por enquanto). Chama a Edge Function
   melhorar-texto (OpenAI, gpt-4o-mini) — de propósito separada do
   prumo-chat (Anthropic): é uma tarefa simples de reescrever, não
   precisa do modelo mais caro nem gastar do saldo da Anthropic, que
   já é mais disputado (chat + transcrição de áudio).
   ============================================================ */

import { supabase } from './supabase'

export async function melhorarTexto(texto) {
  const { data, error } = await supabase.functions.invoke('melhorar-texto', {
    body: { texto },
  })
  if (error) { console.error('[Prumo] melhorar texto:', error); return null }
  if (data?.erro) { console.error('[Prumo] melhorar texto:', data.erro); return null }
  return data?.texto?.trim() || null
}
