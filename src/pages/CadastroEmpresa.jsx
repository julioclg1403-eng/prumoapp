/* ============================================================
   ABRIR A PRÓPRIA OBRA — primeira tela de quem acabou de criar conta.
   Cria a empresa, a primeira obra e liga a pessoa como administradora
   (função criar_minha_organizacao, no banco). A partir daí tudo que
   ela cadastrar fica só na empresa dela.
   ============================================================ */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_NOME } from '../lib/config'
import { Campo } from '../components'
import { meusConvites, aceitarConvite } from '../lib/convites'
import PedidoPorLink from '../components/PedidoPorLink'
import { codigoGuardado } from '../lib/linkConvite'

const NOME_DO_PERFIL = { campo: 'Campo', gestao: 'Gestão', admin: 'Admin' }

export default function CadastroEmpresa({ perfil, codigoDaConta, onCriada, onSair }) {
  const [codigo] = useState(() => codigoGuardado() || codigoDaConta || null)
  /* Quem veio por convite não deve cair no "abrir a própria obra" sem
     querer: o formulário fica escondido até a pessoa pedir. */
  const [veioPorConvite, setVeioPorConvite] = useState(Boolean(codigo))
  const [quisCriar, setQuisCriar] = useState(false)
  const mostrarFormulario = !veioPorConvite || quisCriar
  const [empresa, setEmpresa] = useState('')
  const [obra, setObra] = useState('')
  const [exemplo, setExemplo] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [convites, setConvites] = useState([])
  const [erroConvite, setErroConvite] = useState('')

  const procurarConvites = async () => {
    const { data, error } = await meusConvites()
    if (error) { console.error('[Prumo] convites:', error); return }
    setConvites(data || [])
  }
  useEffect(() => { procurarConvites() }, [])

  const aceitar = async (id) => {
    setErroConvite('')
    setEnviando(true)
    const { error } = await aceitarConvite(id)
    setEnviando(false)
    if (error) { setErroConvite(error.message); return }
    onCriada()
  }

  const criar = async (e) => {
    e.preventDefault()
    setErro('')
    if (empresa.trim().length < 2) { setErro('Escreva o nome da sua empresa.'); return }
    if (obra.trim().length < 2) { setErro('Escreva o nome da primeira obra.'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('criar_minha_organizacao', {
      p_empresa: empresa.trim(), p_obra: obra.trim(), p_exemplo: exemplo,
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onCriada()
  }

  return (
    <div className="app">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--graphite)' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-graphite)' }}>
              {APP_NOME}<span style={{ color: 'var(--primary)' }}>.</span>
            </div>
            <div style={{ color: 'var(--on-graphite-2)', fontSize: 14, marginTop: 4 }}>
              {veioPorConvite
                ? (perfil?.nome ? `Olá, ${perfil.nome}.` : 'Olá.')
                : <>{perfil?.nome ? `Bem-vindo, ${perfil.nome}.` : 'Bem-vindo.'} Vamos abrir a sua obra.</>}
            </div>
          </div>

          {convites.map((c) => (
            <div key={c.id} className="card" style={{ marginBottom: 14 }}>
              <div className="t-strong" style={{ fontSize: 16 }}>{c.empresa} convidou você</div>
              <div className="t-caption" style={{ margin: '4px 0 12px' }}>
                Perfil de acesso: {NOME_DO_PERFIL[c.papel] || c.papel}. Aceite só se você conhece essa empresa.
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => aceitar(c.id)} disabled={enviando}>
                Aceitar e entrar
              </button>
            </div>
          ))}
          {erroConvite && <div className="alert danger" style={{ marginBottom: 14 }}>{erroConvite}</div>}

          <PedidoPorLink codigo={codigo} aoAchar={() => setVeioPorConvite(true)} aoVerificar={onCriada} />

          {!mostrarFormulario && (
            <button type="button" className="btn btn-ghost btn-block" style={{ color: 'var(--on-graphite-2)' }} onClick={() => setQuisCriar(true)}>
              Quero abrir a minha própria obra
            </button>
          )}

          {mostrarFormulario && <form className="card" onSubmit={criar}>
            <div className="stack-2">
              <Campo label="Nome da empresa">
                <input className="ipt" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={80} placeholder="Ex.: Construtora Silva" autoFocus />
              </Campo>
              <Campo label="Nome da primeira obra">
                <input className="ipt" value={obra} onChange={(e) => setObra(e.target.value)} maxLength={80} placeholder="Ex.: Residencial Aurora" />
              </Campo>
              <label className="row-flex" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={exemplo} onChange={(e) => setExemplo(e.target.checked)} style={{ marginTop: 3 }} />
                <span className="t-caption" style={{ lineHeight: 1.5 }}>
                  Começar com dados de exemplo (uma semana de diários, equipe e pendências fictícios) para eu conhecer o app. Dá para apagar depois.
                </span>
              </label>
              {erro && <div className="alert danger">{erro}</div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
                {enviando ? 'Criando…' : 'Criar minha obra'}
              </button>
            </div>
          </form>}

          {!veioPorConvite && (
            <>
              <div className="t-caption" style={{ color: 'var(--on-graphite-2)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
                A sua empresa já usa o {APP_NOME}? Não crie uma obra nova: peça um link de convite
                ao administrador e abra-o aqui neste aparelho.
              </div>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8, color: 'var(--on-graphite-2)' }} onClick={procurarConvites}>
                Procurar convite de novo
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8, color: 'var(--on-graphite-2)' }} onClick={onSair}>
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
