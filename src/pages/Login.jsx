/* ============================================================
   ENTRAR. Não existe cadastro aberto: o acesso é só por convite
   (a tela do convite é pages/Convite.jsx).
   ============================================================ */

import { useState } from 'react'
import { APP_NOME } from '../lib/config'
import { supabase, supabaseConfigurado } from '../lib/supabase'
import { Campo } from '../components'
import { pedirTroca, abrirNoWhatsapp, pedidoDeSenhaPorWhatsapp } from '../lib/linkConvite'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [pediu, setPediu] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // o pedido vai para o administrador da empresa, que libera e manda o link
  const esqueci = async () => {
    setErro(''); setAviso(''); setPediu(false)
    if (!email.trim()) { setErro('Escreva seu e-mail primeiro.'); return }
    setEnviando(true)
    const { error } = await pedirTroca(email.trim().toLowerCase())
    setEnviando(false)
    if (error) setErro('Não consegui registrar o pedido. Avise o administrador da sua empresa.')
    else setPediu(true)
  }

  /* Saída para quem é o único administrador: não há quem libere. */
  const porEmail = async () => {
    setErro(''); setAviso(''); setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin })
    setEnviando(false)
    if (error) setErro('Não consegui enviar o e-mail.')
    else setAviso('Se existir conta com esse e-mail e o envio estiver disponível, o link chega em instantes.')
  }

  const entrar = async (e) => {
    e.preventDefault()
    setErro(''); setAviso(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password: senha,
    })
    setEnviando(false)
    if (error) {
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos.'
          : `Não consegui entrar. ${error.message}`,
      )
    }
  }

  if (!supabaseConfigurado) {
    return (
      <div className="app">
        <div className="page" style={{ paddingTop: 80, maxWidth: 460 }}>
          <div className="card">
            <div className="t-title" style={{ marginBottom: 8 }}>Falta a configuração do banco</div>
            <div className="t-caption" style={{ lineHeight: 1.6 }}>
              O app foi montado sem as chaves do Supabase, então não tem como conversar com o banco.
              Faltam <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong>.
            </div>
            <div className="alert info" style={{ marginTop: 14, lineHeight: 1.6 }}>
              <strong>No site publicado:</strong> cadastre as duas em Settings → Environment
              Variables e mande publicar de novo. As chaves entram na hora de montar o app, não
              quando alguém abre a página — por isso cadastrar sem republicar não resolve.
              <br /><br />
              <strong>No seu computador:</strong> elas ficam no arquivo <code>.env.local</code>, na
              pasta do projeto.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, background: 'var(--graphite)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-graphite)' }}>
              {APP_NOME}<span style={{ color: 'var(--primary)' }}>.</span>
            </div>
            <div style={{ color: 'var(--on-graphite-2)', fontSize: 14, marginTop: 4 }}>
              Gestão de obra, do canteiro ao escritório
            </div>
          </div>

          <form className="card stack-2" onSubmit={entrar}>
            <Campo label="E-mail">
              <input
                className="ipt" type="email" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br" required
              />
            </Campo>

            <Campo label="Senha">
              <input
                className="ipt" type="password" autoComplete="current-password"
                value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••" required
              />
            </Campo>

            {erro && <div className="alert danger">{erro}</div>}
            {aviso && <div className="alert success">{aviso}</div>}
            {pediu && (
              <div className="stack-2">
                <div className="alert success" style={{ lineHeight: 1.5 }}>
                  Pedido registrado. Se este e-mail tem acesso ao Prumo, o administrador da sua empresa vê o
                  pedido e manda o link para você criar a senha nova.
                </div>
                <a className="btn btn-secondary btn-block" href={abrirNoWhatsapp(pedidoDeSenhaPorWhatsapp)} target="_blank" rel="noopener noreferrer">
                  Avisar no WhatsApp
                </a>
                <button className="btn btn-ghost btn-sm" type="button" onClick={porEmail} disabled={enviando}>
                  Único admin? Tentar por e-mail
                </button>
              </div>
            )}

            <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
              {enviando ? 'Aguarde…' : 'Entrar'}
            </button>

            <button className="btn btn-ghost btn-sm" type="button" onClick={esqueci} disabled={enviando}>
              Esqueci minha senha
            </button>
          </form>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O acesso é só por convite. Recebeu um? Abra o link que veio na mensagem.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
