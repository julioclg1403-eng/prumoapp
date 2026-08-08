/* ============================================================
   LOGIN e CADASTRO.

   Quem se cadastra aqui NÃO ganha acesso: nasce sem papel, e sem
   papel não enxerga um dado sequer — não é a tela que esconde, é
   o banco que não entrega. Um admin precisa liberar depois.
   Esse caminho existe porque convidar por e-mail exigiria a chave
   administrativa do Supabase, e ela nunca pode ir para o navegador.
   ============================================================ */

import { useState } from 'react'
import { APP_NOME } from '../lib/config'
import { supabase, supabaseConfigurado } from '../lib/supabase'
import { Campo } from '../components'

export default function Login() {
  const [modo, setModo] = useState('entrar')      // 'entrar' | 'criar'
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setErro(''); setAviso(''); setEnviando(true)

    if (modo === 'entrar') {
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
      return
    }

    if (senha.length < 6) {
      setEnviando(false)
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: { data: { nome: nome.trim() } },
    })
    setEnviando(false)

    if (error) { setErro(`Não consegui criar a conta. ${error.message}`); return }
    if (!data.session) {
      setAviso('Conta criada. Confirme o e-mail que acabamos de enviar e depois entre por aqui.')
      setModo('entrar')
      return
    }
    /* Entrou direto: o App vai ver que ainda não tem papel e
       mostrar a tela de "acesso ainda não liberado". */
  }

  const esqueci = async () => {
    if (!email.trim()) { setErro('Escreva seu e-mail primeiro.'); return }
    setErro(''); setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase())
    setEnviando(false)
    if (error) setErro(`Não consegui enviar. ${error.message}`)
    else setAviso('Se existir conta com esse e-mail, o link de nova senha chegou nele.')
  }

  if (!supabaseConfigurado) {
    return (
      <div className="app">
        <div className="page" style={{ paddingTop: 80, maxWidth: 460 }}>
          <div className="card">
            <div className="t-title" style={{ marginBottom: 8 }}>Falta a configuração do banco</div>
            <div className="t-caption" style={{ lineHeight: 1.6 }}>
              O arquivo <strong>.env.local</strong> não foi encontrado ou está sem as chaves do
              Supabase. Sem ele o app não tem como conversar com o banco.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const criando = modo === 'criar'

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
            {criando && (
              <Campo label="Seu nome">
                <input
                  className="ipt" value={nome} onChange={(e) => setNome(e.target.value)}
                  placeholder="Como você é chamado na obra" required
                />
              </Campo>
            )}

            <Campo label="E-mail">
              <input
                className="ipt" type="email" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br" required
              />
            </Campo>

            <Campo label="Senha" dica={criando ? 'Mínimo de 6 caracteres.' : undefined}>
              <input
                className="ipt" type="password"
                autoComplete={criando ? 'new-password' : 'current-password'}
                value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••" required
              />
            </Campo>

            {erro && <div className="alert danger">{erro}</div>}
            {aviso && <div className="alert success">{aviso}</div>}

            <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
              {enviando ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
            </button>

            {!criando && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={esqueci} disabled={enviando}>
                Esqueci minha senha
              </button>
            )}
          </form>

          <div className="card" style={{ marginTop: 14 }}>
            {criando ? (
              <>
                <div className="t-caption" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                  Criar a conta é o primeiro passo. O acesso à obra quem libera é o administrador —
                  avise-o depois de se cadastrar.
                </div>
                <button className="btn btn-secondary btn-block" onClick={() => { setModo('entrar'); setErro(''); setAviso('') }}>
                  Já tenho conta
                </button>
              </>
            ) : (
              <>
                <div className="t-caption" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                  Primeira vez? Crie sua conta e peça ao administrador para liberar seu acesso.
                </div>
                <button className="btn btn-secondary btn-block" onClick={() => { setModo('criar'); setErro(''); setAviso('') }}>
                  Criar uma conta
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
