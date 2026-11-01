/* ============================================================
   VOZ DA ANA — ouvir e falar, no navegador.

   • ouvirUmaFala(): abre o microfone, espera a pessoa começar a
     falar e devolve o áudio quando ela para (silêncio). Sem sair do
     app e sem apertar nada além do botão da conversa.
   • falar(): pede a voz de mulher pra função ana-voz (OpenAI); se
     ela falhar, cai na voz do próprio aparelho (speechSynthesis),
     que é mais robótica mas nunca deixa a Ana muda.
   • limparParaFala(): tira markdown e símbolos do texto antes de ler.
   ============================================================ */

import { supabase } from './supabase'

const LIMIAR_VOZ = 0.035      // volume (0 a 1) acima do qual conta como fala
const SILENCIO_FIM_MS = 1300  // quanto silêncio encerra a fala
const ESPERA_INICIO_MS = 9000 // sem ninguém falar, desiste e para de ouvir
const FALA_MAXIMA_MS = 40000

/* Fala atual (pra poder interromper) */
let audioAtual = null
let urlAtual = null
let cancelarEscuta = null

export function interromperFala() {
  if (audioAtual) { try { audioAtual.pause() } catch { /* já parou */ } audioAtual = null }
  if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

export function interromperEscuta() {
  if (cancelarEscuta) cancelarEscuta()
}

export function limparParaFala(texto) {
  return String(texto || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[#>\-*•\s]+/gm, '')
    .replace(/[*_~#|]/g, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function vozDoAparelho(texto) {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') { resolve(); return }
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = 'pt-BR'
    const vozes = speechSynthesis.getVoices().filter((v) => /pt[-_]BR/i.test(v.lang))
    const feminina = vozes.find((v) => /maria|francisca|luciana|vit[oó]ria|google/i.test(v.name)) || vozes[0]
    if (feminina) u.voice = feminina
    u.rate = 1.03
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}

/* Devolve quando a Ana termina de falar (ou é interrompida). */
export async function falar(texto) {
  const limpo = limparParaFala(texto)
  if (!limpo) return
  interromperFala()
  try {
    const sessao = (await supabase.auth.getSession()).data.session
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ana-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessao?.access_token || ''}`,
      },
      body: JSON.stringify({ texto: limpo }),
    })
    if (!r.ok) throw new Error(`ana-voz ${r.status}`)
    const url = URL.createObjectURL(await r.blob())
    urlAtual = url
    const audio = new Audio(url)
    audioAtual = audio
    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = reject
      audio.onpause = resolve // interrompida
      audio.play().catch(reject)
    })
  } catch (e) {
    console.error('[Ana] voz do servidor indisponível, usando a do aparelho:', e)
    await vozDoAparelho(limpo)
  } finally {
    if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null }
    audioAtual = null
  }
}

/* Escuta uma fala. Resolve com { blob } quando a pessoa termina,
   { vazio: true } se ninguém falou, ou { erro } se o microfone falhou. */
export async function ouvirUmaFala() {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch {
    return { erro: 'mic' }
  }

  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  const analisador = ctx.createAnalyser()
  analisador.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analisador)
  const amostra = new Uint8Array(analisador.fftSize)

  const gravador = new MediaRecorder(stream)
  const pedacos = []
  gravador.ondataavailable = (e) => { if (e.data.size > 0) pedacos.push(e.data) }

  return new Promise((resolve) => {
    let falou = false
    let ultimoSom = performance.now()
    const inicio = performance.now()
    let encerrado = false

    const encerrar = (resultado) => {
      if (encerrado) return
      encerrado = true
      clearInterval(timer)
      cancelarEscuta = null
      const fim = () => {
        stream.getTracks().forEach((t) => t.stop())
        ctx.close().catch(() => {})
        resolve(resultado(new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' })))
      }
      if (gravador.state !== 'inactive') { gravador.onstop = fim; gravador.stop() } else fim()
    }
    cancelarEscuta = () => encerrar(() => ({ vazio: true }))

    gravador.start()
    const timer = setInterval(() => {
      analisador.getByteTimeDomainData(amostra)
      let soma = 0
      for (let i = 0; i < amostra.length; i++) { const v = (amostra[i] - 128) / 128; soma += v * v }
      const volume = Math.sqrt(soma / amostra.length)
      const agora = performance.now()
      if (volume > LIMIAR_VOZ) { falou = true; ultimoSom = agora }
      if (!falou && agora - inicio > ESPERA_INICIO_MS) encerrar(() => ({ vazio: true }))
      else if (falou && agora - ultimoSom > SILENCIO_FIM_MS) encerrar((blob) => ({ blob }))
      else if (agora - inicio > FALA_MAXIMA_MS) encerrar((blob) => (falou ? { blob } : { vazio: true }))
    }, 100)
  })
}
