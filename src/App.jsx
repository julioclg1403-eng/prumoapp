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
import SemEmpresa from './pages/SemEmpresa'
import Convite from './pages/Convite'
import NovaSenha from './pages/NovaSenha'
import AppCampo from './pages/AppCampo'
import AppGestao from './pages/AppGestao'
import { lerLinkDoEndereco, linkGuardado, esquecerLink } from './lib/linkConvite'

/* Lidos uma vez, antes de qualquer tela. O endereço do link de nova
   senha é apagado pelo Supabase logo depois de lido, por isso a
   marca é guardada já aqui. */
lerLinkDoEndereco()
const veioTrocarSenha = typeof window !== 'undefined' && /[#&]type=recovery(&|$)/.test(window.location.hash)

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [trocarSenha, setTrocarSenha] = useState(veioTrocarSenha)

  useEffect(() => {
    if (!supabaseConfigurado) { setCarregando(false); return }

    let vivo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      if (!data.session) setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (!vivo) return
      if (evento === 'PASSWORD_RECOVERY') setTrocarSenha(true)
      setSessao(s)
      if (!s) { setPerfil(null); setCarregando(false) }
    })

    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

  /* Link de acesso (convite ou troca de senha) aberto e ainda não usado. */
  const [link, setLink] = useState(linkGuardado)
  const dispensarLink = () => { esquecerLink(); setLink(null) }
  const [versaoPerfil, setVersaoPerfil] = useState(0)
  const [erroPerfil, setErroPerfil] = useState(false)

  useEffect(() => {
    if (!sessao) return
    let vivo = true

    ;(async () => {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', sessao.user.id).maybeSingle()
      if (!vivo) return
      if (error) console.error('[Prumo] carregar o perfil:', error)
      setErroPerfil(!!error)
      setPerfil(data || null)
      setCarregando(false)
    })()

    return () => { vivo = false }
  }, [sessao, versaoPerfil])

  // link colado numa aba que já estava aberta: só muda o "#", então recarrega
  useEffect(() => {
    const colou = () => { if (lerLinkDoEndereco()) window.location.reload() }
    window.addEventListener('hashchange', colou)
    return () => window.removeEventListener('hashchange', colou)
  }, [])

  const sair = async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setSessao(null)
  }

  if (carregando) {
    return <div className="app"><div className="empty" style={{ paddingTop: 120 }}>Carregando…</div></div>
  }

  /* Sem sessão: quem abriu um convite cria a senha; o resto entra com
     a própria conta. Não há cadastro aberto (a página de apresentação,
     pages/Landing.jsx, volta quando houver venda com cadastro). */
  if (!sessao) {
    return link ? <Convite tipo={link.tipo} codigo={link.codigo} aoIrParaEntrar={dispensarLink} /> : <Login />
  }

  if (trocarSenha) {
    return <NovaSenha email={sessao.user.email} onPronto={() => setTrocarSenha(false)} />
  }

  /* Abriu um link de acesso já estando conectado: avisa, em vez de
     entrar no próprio app sem explicar nada. */
  if (link && linkGuardado()?.codigo === link.codigo) {
    return (
      <div className="app">
        <div className="page" style={{ paddingTop: 60, maxWidth: 460 }}>
          <div className="card">
            <div className="t-title" style={{ marginBottom: 8 }}>Você já está conectado</div>
            <div className="t-caption" style={{ lineHeight: 1.6, overflowWrap: 'anywhere' }}>
              Este aparelho está com a conta <strong>{sessao.user.email}</strong>. Para usar
              {link.tipo === 'senha' ? ' o link de troca de senha' : ' o convite'} que você abriu, saia desta conta.
              Se o link é de outra pessoa, não use.
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={dispensarLink}>
              Continuar na minha conta
            </button>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={sair}>
              Sair e abrir o link
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* Conta sem empresa: só aceita convite (o acesso é só por convite).
     Sem empresa, o banco nem deixa a pessoa ler o próprio perfil (a
     regra de acesso é por organização): perfil vazio, sem erro de
     leitura, é esse caso. */
  if ((!perfil && !erroPerfil) || (perfil && !perfil.organization_id)) {
    return <SemEmpresa perfil={perfil} onEntrou={() => setVersaoPerfil((v) => v + 1)} onSair={sair} />
  }

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
