/* ============================================================
   PONTO DE ENTRADA — decide quem entrou e qual "casca" mostrar.

   O papel (campo / gestão / admin) manda na tela que aparece,
   mas isso é só conveniência: a trava de verdade está no banco.
   Quem trocar o papel no navegador continua não recebendo os
   dados, porque as políticas do Postgres leem o papel da tabela
   `profiles`, não do que o navegador diz.
   ============================================================ */

import { useEffect, useState } from 'react'
import { supabase, supabaseConfigurado } from './lib/supabase'
import { DadosProvider } from './lib/DadosContext'
import Login from './pages/Login'
import AppCampo from './pages/AppCampo'
import AppGestao from './pages/AppGestao'

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!supabaseConfigurado) { setCarregando(false); return }

    let vivo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      if (!data.session) setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (!vivo) return
      setSessao(s)
      if (!s) { setPerfil(null); setCarregando(false) }
    })

    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!sessao) return
    let vivo = true

    ;(async () => {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', sessao.user.id).maybeSingle()
      if (!vivo) return
      if (error) console.error('[Prumo] carregar o perfil:', error)
      setPerfil(data || null)
      setCarregando(false)
    })()

    return () => { vivo = false }
  }, [sessao])

  const sair = async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setSessao(null)
  }

  if (carregando) {
    return <div className="app"><div className="empty" style={{ paddingTop: 120 }}>Carregando…</div></div>
  }

  if (!sessao) return <Login />

  /* A conta existe, mas nenhum admin liberou o acesso ainda.
     Sem papel e sem organização, as políticas do banco não
     entregam nem uma linha — então não há tela para mostrar. */
  if (!perfil || !perfil.role || !perfil.organization_id) {
    return (
      <div className="app">
        <div className="page" style={{ paddingTop: 60, maxWidth: 460 }}>
          <div className="card">
            <div className="t-title" style={{ marginBottom: 8 }}>Acesso ainda não liberado</div>
            <div className="t-caption" style={{ lineHeight: 1.6 }}>
              Sua conta foi criada{perfil?.nome ? `, ${perfil.nome}` : ''}, mas o administrador ainda
              não definiu o seu perfil de acesso e a sua obra. Avise-o — leva um minuto do lado dele.
            </div>
            <div className="alert info" style={{ marginTop: 14 }}>
              Enquanto isso você não consegue ver nenhum dado da obra. Isso é proposital.
            </div>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={sair}>
              Sair
            </button>
          </div>
        </div>
      </div>
    )
  }

  const Casca = perfil.role === 'campo' ? AppCampo : AppGestao

  return (
    <DadosProvider perfil={perfil}>
      <Casca perfil={perfil} onSair={sair} />
    </DadosProvider>
  )
}
