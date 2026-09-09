/* ============================================================
   Melhorar texto com IA — pro botão que aparece em campos de texto
   livre onde vale deixar a redação mais técnica (Descrição e
   Comentários de Projetos, por enquanto). Reaproveita a Edge Function
   prumo-chat (mesma do assistente do Prumo), só que numa chamada só,
   sem ferramenta e sem histórico — não é conversa, é reescrever.
   ============================================================ */

import { supabase } from './supabase'

export async function melhorarTexto(texto) {
  const { data, error } = await supabase.functions.invoke('prumo-chat', {
    body: {
      messages: [{
        role: 'user',
        content: [
          'Reescreva o texto abaixo em português, em tom mais técnico e profissional — apropriado para um relatório de obra/engenharia.',
          'Mantenha TODAS as informações (números, datas, códigos, nomes) exatamente como estão, sem inventar nada e sem remover nada.',
          'Não use nenhuma ferramenta, não pesquise nada. Responda só com o texto reescrito, sem aspas, sem comentário nenhum antes ou depois.',
          '',
          'Texto original:',
          texto,
        ].join('\n'),
      }],
    },
  })
  if (error) { console.error('[Prumo] melhorar texto:', error); return null }
  if (data?.error) { console.error('[Prumo] melhorar texto:', data.error); return null }
  const melhorado = (data?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  return melhorado || null
}
