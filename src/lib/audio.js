/* ============================================================
   Transcrição de áudio, pro botão de microfone que aparece em
   qualquer campo de texto livre do app. Chama a Edge Function
   transcrever-audio, que fala com o Whisper por trás -- a chave da
   OpenAI nunca chega no navegador.
   ============================================================ */

import { supabase } from './supabase'

export async function transcrever(blob) {
  const { data, error } = await supabase.functions.invoke('transcrever-audio', {
    body: blob,
    headers: { 'Content-Type': blob.type || 'audio/webm' },
  })
  if (error) { console.error('[Prumo] transcrever áudio:', error); return null }
  if (data?.erro) { console.error('[Prumo] transcrever áudio:', data.erro); return null }
  return data?.texto ?? null
}
