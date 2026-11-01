/* ============================================================
   ASSISTENTE DE IA — botão flutuante visível em qualquer tela,
   abre um painel de chat que fala com a Edge Function "prumo-chat"
   (já publicada no Supabase; ela cuida da chave da Anthropic).

   Além de conversar, o assistente pode usar ferramentas (ver
   agenteFerramentas.js) pra abrir telas do app e consultar dados
   reais, como o ranking de rendimento por colaborador. Quando o
   Claude pede pra usar uma ferramenta (stop_reason: 'tool_use'),
   a gente executa localmente e manda o resultado de volta, num
   loop, até ele responder só com texto.
   ============================================================ */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/DadosContext'
import { FERRAMENTAS, executarFerramenta } from '../lib/agenteFerramentas'
import { transcrever } from '../lib/audio'
import { falar, ouvirUmaFala, interromperFala, interromperEscuta } from '../lib/anaVoz'
import { Icon, TextareaComAudio } from './index'

const MAX_RODADAS_DE_FERRAMENTA = 4

function textoDosBlocos(content) {
  return (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export default function ChatBot({ navegar, perfil }) {
  const dados = useDados()
  const [aberto, setAberto] = useState(false)
  const [minimizado, setMinimizado] = useState(false)
  const [mensagens, setMensagens] = useState([]) // só pra exibição: {role, content: string}
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [voz, setVoz] = useState('off') // off | ouvindo | pensando | falando
  const vozAtivaRef = useRef(false)
  const historicoRef = useRef([]) // formato Anthropic completo, com blocos de tool_use/tool_result
  const fimRef = useRef(null)

  useEffect(() => {
    if (aberto && !minimizado) fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto, minimizado, carregando])

  const chamarAssistente = async (historico) => {
    const agora = new Date()
    const { data, error } = await supabase.functions.invoke('prumo-chat', {
      body: {
        messages: historico,
        tools: FERRAMENTAS,
        contexto: { agora_iso: agora.toISOString(), fuso: Intl.DateTimeFormat().resolvedOptions().timeZone, modo_voz: vozAtivaRef.current },
      },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  /* Manda uma mensagem pra Ana e devolve o texto da resposta (ou '' se falhou). */
  const enviarTexto = async (conteudo) => {
    if (!conteudo) return ''
    historicoRef.current = [...historicoRef.current, { role: 'user', content: conteudo }]
    setMensagens((m) => [...m, { role: 'user', content: conteudo }])
    setTexto('')
    setErro('')
    setCarregando(true)
    let respostaFinal = ''
    try {
      let rodadas = 0
      for (;;) {
        const resposta = await chamarAssistente(historicoRef.current)
        historicoRef.current = [...historicoRef.current, { role: 'assistant', content: resposta.content }]

        if (rodadas >= MAX_RODADAS_DE_FERRAMENTA || (resposta.stop_reason !== 'tool_use' && resposta.stop_reason !== 'pause_turn')) {
          const textoFinal = textoDosBlocos(resposta.content)
          respostaFinal = textoFinal
          setMensagens((m) => [...m, { role: 'assistant', content: textoFinal || 'Não consegui responder agora — tenta de novo.' }])
          break
        }

        rodadas += 1

        if (resposta.stop_reason === 'pause_turn') {
          continue // busca na web ainda rodando — manda de volta sem alteração
        }
        const usosDeFerramenta = resposta.content.filter((b) => b.type === 'tool_use')
        const resultados = await Promise.all(usosDeFerramenta.map(async (uso) => {
          const resultado = await executarFerramenta(uso.name, uso.input, { dados, navegar, perfil })
          return { type: 'tool_result', tool_use_id: uso.id, content: JSON.stringify(resultado) }
        }))
        historicoRef.current = [...historicoRef.current, { role: 'user', content: resultados }]
      }
    } catch {
      setErro('Não consegui falar com o assistente agora. Tenta de novo em instantes.')
    } finally {
      setCarregando(false)
    }
    return respostaFinal
  }

  const enviar = async () => {
    const conteudo = texto.trim()
    if (!conteudo || carregando) return
    await enviarTexto(conteudo)
  }

  /* Conversa por voz, estilo Jarvis: ouve → pensa → fala → ouve de novo,
     até a pessoa parar ou ficar em silêncio. */
  const pararVoz = () => {
    vozAtivaRef.current = false
    interromperEscuta()
    interromperFala()
    setVoz('off')
  }

  const iniciarVoz = async () => {
    if (vozAtivaRef.current) { pararVoz(); return }
    vozAtivaRef.current = true
    setErro('')
    setMinimizado(false)
    while (vozAtivaRef.current) {
      setVoz('ouvindo')
      const fala = await ouvirUmaFala()
      if (!vozAtivaRef.current) break
      if (fala.erro) { setErro('Não consegui acessar o microfone. Verifique a permissão do navegador.'); break }
      if (fala.vazio) break // ninguém falou: encerra sozinha
      setVoz('pensando')
      const transcrito = await transcrever(fala.blob)
      if (!vozAtivaRef.current) break
      if (transcrito == null) { setErro('Não consegui entender o áudio. Tenta de novo.'); break }
      if (!transcrito.trim()) continue
      const resposta = await enviarTexto(transcrito.trim())
      if (!vozAtivaRef.current) break
      if (resposta) {
        setVoz('falando')
        await falar(resposta)
      }
    }
    pararVoz()
  }

  useEffect(() => () => { vozAtivaRef.current = false; interromperEscuta(); interromperFala() }, [])

  const aoTeclar = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  const fechar = () => {
    setAberto(false)
    setMinimizado(false)
  }

  const POSICAO_FLUTUANTE = {
    position: 'fixed',
    bottom: 'calc(70px + env(safe-area-inset-bottom) + 12px)',
    right: 16,
    zIndex: 90,
  }

  return (
    <>
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir a Ana, assistente do Prumo"
          style={{
            ...POSICAO_FLUTUANTE,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            boxShadow: 'var(--shadow-pop)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="comentario" size={24} />
        </button>
      )}

      {aberto && minimizado && (
        <button
          onClick={() => setMinimizado(false)}
          aria-label="Reabrir a Ana"
          style={{
            ...POSICAO_FLUTUANTE,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            borderRadius: 999,
            background: 'var(--graphite)',
            color: '#FAFAFA',
            boxShadow: 'var(--shadow-pop)',
            padding: '10px 16px',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          <Icon name="comentario" size={18} />
          <span>{voz === 'off' ? 'Ana' : voz === 'ouvindo' ? 'Ana · ouvindo…' : voz === 'pensando' ? 'Ana · pensando…' : 'Ana · falando…'}</span>
          {carregando && (
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--primary)',
                animation: 'prumo-pulso 1s infinite ease-in-out',
              }}
            />
          )}
        </button>
      )}

      {aberto && !minimizado && (
        <div
          role="dialog"
          aria-label="Ana, assistente do Prumo"
          style={{
            ...POSICAO_FLUTUANTE,
            width: 'min(94vw, 380px)',
            height: 'min(70vh, 560px)',
            background: 'var(--surface)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-pop)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            className="row-between"
            style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
          >
            <div className="t-title" style={{ fontSize: 15 }}>Ana <span className="t-caption" style={{ fontWeight: 400 }}>· assistente do Prumo</span></div>
            <div className="row-flex" style={{ gap: 4 }}>
              <button
                className={`btn btn-sm ${voz === 'off' ? 'btn-ghost' : 'btn-danger'}`}
                onClick={iniciarVoz}
                aria-label={voz === 'off' ? 'Conversar por voz com a Ana' : 'Encerrar conversa por voz'}
                title={voz === 'off' ? 'Conversar por voz' : 'Encerrar conversa por voz'}
              >
                <Icon name={voz === 'off' ? 'microfone' : 'parar'} size={16} />
                {voz === 'off' ? ' Voz' : ' Parar'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMinimizado(true)}
                aria-label="Minimizar assistente"
                title="Minimizar (a conversa continua salva)"
              >
                <Icon name="minus" size={16} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={fechar} aria-label="Fechar assistente">
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
            {mensagens.length === 0 && (
              <div className="t-caption" style={{ textAlign: 'center', marginTop: 24 }}>
                Oi, eu sou a Ana. Pergunte qualquer coisa sobre a obra, peça pra abrir uma tela ou consultar
                rendimento — diário, pendências, efetivo, planejamento e outros módulos do Prumo.
                Toque em <b>Voz</b> pra conversar falando.
              </div>
            )}
            {mensagens.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  background: m.role === 'user' ? 'var(--primary)' : 'var(--graphite)',
                  color: '#FAFAFA',
                  padding: '8px 12px',
                  borderRadius: 14,
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: m.role === 'assistant' ? 4 : 14,
                  fontSize: 14,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {carregando && (
              <div style={{ alignSelf: 'flex-start', color: 'var(--text-3)', fontSize: 13 }}>
                Ana está pensando… <span className="t-caption">(pode minimizar e continuar usando o app)</span>
              </div>
            )}
            {erro && <div className="t-caption" style={{ color: 'var(--danger)' }}>{erro}</div>}
            <div ref={fimRef} />
          </div>

          <div className="row-flex" style={{ gap: 8, padding: '10px 14px', alignItems: 'flex-start', flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <TextareaComAudio
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Escreva ou grave sua pergunta pra Ana…"
                disabled={carregando}
                style={{ minHeight: 44, height: 44, paddingTop: 10 }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={enviar}
              disabled={carregando || !texto.trim()}
              aria-label="Enviar mensagem"
              style={{ height: 44, width: 44, flexShrink: 0, padding: 0 }}
            >
              <Icon name="avancar" size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
