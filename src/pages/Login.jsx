import { useState } from 'react'
import { USAR_MOCK, APP_NOME } from '../lib/config'
import { supabase, supabaseConfigurado } from '../lib/supabase'
import { mockPerfis } from '../lib/mockData'
import { Campo } from '../components'

const ROTULO_PAPEL = { campo: 'Campo', gestao: 'Gestão', admin: 'Admin' }

export default function Login({ onEntrar }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setErro('')

    if (USAR_MOCK || !supabaseConfigurado) {
      const perfil = mockPerfis.find((p) => p.email === email.trim().toLowerCase())
      if (!perfil) {
        setErro('Nesta versão de demonstração, use um dos acessos abaixo.')
        return
      }
      onEntrar(perfil)
      return
    }

    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro('E-mail ou senha incorretos.')
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
            <div
              style={{
                fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em',
                color: 'var(--on-graphite)',
              }}
            >
              {APP_NOME}
              <span style={{ color: 'var(--primary)' }}>.</span>
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
                placeholder="voce@example.com" required
              />
            </Campo>
            <Campo label="Senha">
              <input
                className="ipt" type="password" autoComplete="current-password"
                value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••" required={!USAR_MOCK}
              />
            </Campo>

            {erro && <div className="alert danger">{erro}</div>}

            <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {(USAR_MOCK || !supabaseConfigurado) && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="t-micro" style={{ marginBottom: 4 }}>Versão de demonstração</div>
              <div className="t-caption" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                Ainda não existe banco de dados. Escolha um perfil para ver o app
                pelos olhos de cada tipo de usuário.
              </div>
              <div className="stack-1">
                {mockPerfis.map((p) => (
                  <button
                    key={p.id} className="btn btn-secondary btn-block"
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => onEntrar(p)} type="button"
                  >
                    <span>{p.nome}</span>
                    <span className="chip">{ROTULO_PAPEL[p.role]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
