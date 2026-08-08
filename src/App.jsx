/* ============================================================
   PONTO DE ENTRADA — decide quem entrou e qual "casca" mostrar.

   O papel (campo / gestão / admin) manda na tela que aparece.
   ATENÇÃO: esconder um botão aqui NÃO é segurança. Na Etapa 7 a
   mesma regra vira política no banco (RLS), que é o que de fato
   impede um usuário de campo de ler dado da gestão.
   ============================================================ */

import { useEffect, useState } from 'react'
import { USAR_MOCK } from './lib/config'
import { supabase, supabaseConfigurado } from './lib/supabase'
import { DadosProvider } from './lib/DadosContext'
import Login from './pages/Login'
import AppCampo from './pages/AppCampo'
import AppGestao from './pages/AppGestao'

export default function App() {
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(!USAR_MOCK)

  useEffect(() => {
    if (USAR_MOCK || !supabaseConfigurado) return

    let vivo = true

    const buscarPerfil = async (session) => {
      if (!session) { if (vivo) { setPerfil(null); setCarregando(false) } ; return }
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      if (!vivo) return
      if (error) console.error('Falha ao carregar o perfil:', error.message)
      setPerfil(data || null)
      setCarregando(false)
    }

    supabase.auth.getSession().then(({ data }) => buscarPerfil(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => buscarPerfil(s))
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

  const sair = async () => {
    if (!USAR_MOCK && supabaseConfigurado) await supabase.auth.signOut()
    setPerfil(null)
  }

  if (carregando) {
    return (
      <div className="app">
        <div className="empty" style={{ paddingTop: 120 }}>Carregando…</div>
      </div>
    )
  }

  if (!perfil) return <Login onEntrar={setPerfil} />

  /* Usuário existe mas ninguém definiu o papel dele: avisar com
     clareza em vez de mostrar uma tela quebrada. */
  if (!perfil.role) {
    return (
      <div className="app">
        <div className="page" style={{ paddingTop: 80, maxWidth: 460 }}>
          <div className="card">
            <div className="t-title" style={{ marginBottom: 8 }}>Acesso ainda não liberado</div>
            <div className="t-caption" style={{ lineHeight: 1.6 }}>
              Sua conta foi criada, mas o administrador ainda não definiu seu perfil de acesso.
              Peça a ele para liberar e entre de novo.
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
