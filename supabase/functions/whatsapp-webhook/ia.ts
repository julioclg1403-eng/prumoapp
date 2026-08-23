// ============================================================
// Whisper transcreve, GPT-4o-mini classifica e extrai. Mesma dupla
// que já roda validada no Comunicação PRO OBRA (áudio real testado
// ponta a ponta lá) -- mesma chave da OpenAI, reaproveitada.
// ============================================================

const CHAVE = () => Deno.env.get('OPENAI_API_KEY')!

export async function transcrever(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  const form = new FormData()
  const extensao = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'oga'
  form.append('file', new Blob([bytes], { type: mimeType }), `audio.${extensao}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CHAVE()}` },
    body: form,
  })
  if (!r.ok) { console.error('[ia] falha na transcrição:', await r.text()); return null }
  const { text } = await r.json()
  return text || null
}

export type Classificacao = {
  categoria: 'pendencia' | 'andamento_servico' | 'lembrete' | 'outro'
  pendencia: { titulo: string; descricao: string | null } | null
  andamento: { servico: string | null; local: string | null; status: 'nao_iniciada' | 'em_andamento' | 'concluida' } | null
  lembrete: { texto: string; disparar_em: string } | null
  resposta_confirmacao: string
}

/* O bot SEMPRE confirma o que entendeu (BRIEFING, seção 6, trava 4).
   É por isso que o próprio modelo já devolve a frase de confirmação:
   ela nasce olhando pros mesmos dados extraídos, então não tem como
   confirmar uma coisa e gravar outra. */
export async function classificar(
  texto: string,
  contexto: { locais: string[]; servicos: string[]; agora: string; nomeRemetente: string },
): Promise<Classificacao | null> {
  const sistema = `Você lê mensagens de WhatsApp de uma obra e devolve JSON estruturado.
Categorias possíveis:
- "pendencia": um problema, falta ou risco visto na obra que alguém precisa resolver -- inclui
  pedido de material ("precisa de 10 sacos de cimento", "falta furadeira"): vira pendência com
  o material pedido no título/descrição.
- "andamento_servico": informa o status de um serviço/frente (começou, terminou, concluiu).
- "lembrete": pede para lembrar de algo em um momento futuro ("me lembra de...", "não deixa eu esquecer...").
- "outro": não se encaixa em nenhuma das anteriores (saudação, pergunta solta, etc.).

Data e hora agora: ${contexto.agora} (America/Sao_Paulo).
Locais cadastrados nesta obra: ${contexto.locais.join(', ') || '(nenhum)'}.
Serviços cadastrados nesta obra: ${contexto.servicos.join(', ') || '(nenhum)'}.

Para "andamento_servico", escolha "servico" e "local" SOMENTE dentre os cadastrados acima
(cópia exata do nome), ou null se não achar correspondência clara -- nunca invente um nome novo.
Para "lembrete", "disparar_em" é uma data/hora ISO 8601 completa, calculada a partir de "agora".
Sempre preencha "resposta_confirmacao": uma frase curta (1 linha), em português, confirmando
exatamente o que foi entendido -- é isso que o bot manda de volta pro remetente (${contexto.nomeRemetente}).
Responda SÓ com o JSON, sem texto fora dele.`

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CHAVE()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: texto },
      ],
    }),
  })
  if (!r.ok) { console.error('[ia] falha na classificação:', await r.text()); return null }
  const dados = await r.json()
  try {
    return JSON.parse(dados.choices[0].message.content)
  } catch (e) {
    console.error('[ia] resposta não veio em JSON válido:', e)
    return null
  }
}
