/* ============================================================
   ASSISTENTE DE IA — botão flutuante visível em qualquer tela,
   abre um painel de chat que fala com a Edge Function "prumo-chat"
   (já publicada no Supabase; ela cuida da chave da Anthropic).
   ============================================================ */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Icon, Sheet, TextareaComAudio } from './index'

export default function ChatBot() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const fimRef = useRef(null)

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto, carregando])

  const enviar = async () => {
    const conteudo = texto.trim()
    if (!conteudo || carregando) return
    const historico = [...mensagens, { role: 'user', content: conteudo }]
    setMensagens(historico)
    setTexto('')
    setErro('')
    setCarregando(true)
    try {
      const { data, error } = await supabase.functions.invoke('prumo-chat', { body: { messages: historico } })
      if (error) throw error
      const resposta = data?.reply?.trim()
      setMensagens((m) => [...m, { role: 'assistant', content: resposta || 'Não consegui responder agora — tenta de novo.' }])
    } catch {
      setErro('Não consegui falar com o assistente agora. Tenta de novo em instantes.')
    } finally {
      setCarregando(false)
    }
  }

  const aoTeclar = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        aria-label="Abrir assistente do Prumo"
        style={{
          position: 'fixed',
          bottom: 'calc(70px + env(safe-area-inset-bottom) + 12px)',
          right: 16,
          zIndex: 85,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--primary)',
          color: '#fff',
          boxShadow: 'var(--shadow-pop)',
          display: aberto ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon name="comentario" size={24} />
      </button>

      <Sheet aberto={aberto} titulo="Assistente Prumo" onFechar={() => setAberto(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
            {mensagens.length === 0 && (
              <div className="t-caption" style={{ textAlign: 'center', marginTop: 24 }}>
                Pergunte qualquer coisa sobre a obra — diário, pendências, efetivo, planejamento e outros módulos do Prumo.
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
              <div style={{ alignSelf: 'flex-start', color: 'var(--text-3)', fontSize: 13 }}>Digitando…</div>
            )}
            {erro && <div className="t-caption" style={{ color: 'var(--danger)' }}>{erro}</div>}
            <div ref={fimRef} />
          </div>

          <div className="row-flex" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <TextareaComAudio
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Escreva ou grave sua pergunta…"
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
      </Sheet>
    </>
  )
}
