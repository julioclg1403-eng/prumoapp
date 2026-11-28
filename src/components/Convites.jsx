/* Convites, na tela de Usuários (só o administrador chega lá):
   nome, e-mail, perfil e obra; o link vai pelo WhatsApp e a pessoa
   só cria a senha. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { listarConvites, cancelarConvite } from '../lib/convites'
import { criarConvite, abrirNoWhatsapp, mensagemDoConvite, quandoVence } from '../lib/linkConvite'
import { Campo } from '.'

export default function Convites({ empresa, obras, obraPadrao, papeis, aoEntrarAlguem }) {
  const papeisDoConvite = papeis.filter((p) => p.valor !== 'admin')
  const rotuloPapel = (v) => papeis.find((p) => p.valor === v)?.rotulo || v
  const nomeObra = (id) => obras.find((o) => o.id === id)?.nome

  const [lista, setLista] = useState([])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('campo')
  const [obraId, setObraId] = useState(obraPadrao || obras[0]?.id || '')
  const [novoId, setNovoId] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const pendentes = useRef([])
  const avisar = useRef(aoEntrarAlguem)
  avisar.current = aoEntrarAlguem

  const carregar = useCallback(async (apagado) => {
    const { data, error } = await listarConvites()
    if (error) { setErro('Não consegui carregar os convites.'); return }
    const agora = (data || []).map((c) => c.id)
    // convite que sumiu sem ter sido cancelado aqui: alguém entrou, então relê a equipe
    if (pendentes.current.some((id) => id !== apagado && !agora.includes(id))) avisar.current?.()
    pendentes.current = agora
    setErro('')
    setLista(data || [])
  }, [])

  useEffect(() => {
    carregar()
    const voltou = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => document.removeEventListener('visibilitychange', voltou)
  }, [carregar])

  const criar = async (e) => {
    e.preventDefault()
    setErro('')
    if (nome.trim().length < 2) { setErro('Escreva o nome da pessoa.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Confira o e-mail.'); return }
    setOcupado(true)
    const limpo = email.trim().toLowerCase()
    // um convite novo para o mesmo e-mail troca o antigo: não é "alguém entrou"
    pendentes.current = pendentes.current.filter((id) => lista.find((c) => c.id === id)?.email !== limpo)
    const { data, error } = await criarConvite({ nome: nome.trim(), email: limpo, papel, obraId })
    setOcupado(false)
    if (error) { setErro(`Não consegui criar o convite. ${error.message}`); return }
    setNovoId(data?.[0]?.id || null)
    setNome(''); setEmail('')
    await carregar()
  }

  const cancelar = async (id) => {
    setOcupado(true)
    const { error } = await cancelarConvite(id)
    setOcupado(false)
    await carregar(id)
    if (error) setErro('Não consegui cancelar o convite.')
  }

  const mensagem = (c) => mensagemDoConvite({ nome: c.nome, empresa, codigo: c.codigo, expiraEm: c.expira_em })

  const copiar = async (c) => {
    try {
      await navigator.clipboard.writeText(mensagem(c))
      setCopiado(c.id)
    } catch { setErro('Não consegui copiar. Use o botão do WhatsApp.') }
  }

  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 10 }}>Convidar pessoa</div>
      <form className="card-flat" onSubmit={criar} noValidate>
        <div className="stack-2">
          <Campo label="Nome da pessoa">
            <input className="ipt" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" placeholder="Nome e sobrenome" />
          </Campo>
          <Campo label="E-mail da pessoa" dica="Será o login. O app não manda e-mail.">
            <input className="ipt" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="pessoa@exemplo.com" />
          </Campo>
          <Campo label="Perfil de acesso">
            <select className="ipt" value={papel} onChange={(e) => setPapel(e.target.value)}>
              {papeisDoConvite.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </Campo>
          <Campo label="Obra">
            <select className="ipt" value={obraId} onChange={(e) => setObraId(e.target.value)}>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Campo>
          {erro && <div className="alert danger">{erro}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={ocupado || !nome.trim() || !email.trim()}>Criar convite</button>
          <div className="t-caption" style={{ lineHeight: 1.5 }}>
            Quem abrir o link primeiro cria a senha e entra. Envie só no privado, para a própria pessoa.
          </div>
        </div>
      </form>

      {lista.length > 0 && (
        <div className="stack-1" style={{ marginTop: 10 }}>
          {lista.map((c) => {
            const vencido = new Date(c.expira_em) < new Date()
            return (
              <div key={c.id} className="card-flat" style={{ borderLeft: `4px solid var(${c.id === novoId ? '--primary' : '--info'})` }}>
                <div className="row-between" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <div className="grow">
                    {c.id === novoId && <div className="t-caption" style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>Pronto para enviar</div>}
                    <div className="t-strong" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{c.nome || c.email}</div>
                    {c.nome && <div className="t-caption" style={{ overflowWrap: 'anywhere' }}>{c.email}</div>}
                    <div className="t-caption">
                      {rotuloPapel(c.role)} · {nomeObra(c.worksite_id) || 'primeira obra'} · {vencido ? 'venceu em' : 'vale até'} {quandoVence(c.expira_em)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelar(c.id)} disabled={ocupado}>Cancelar</button>
                </div>
                {!vencido && c.codigo && (
                  <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
                    <a className="btn btn-primary grow" href={abrirNoWhatsapp(mensagem(c))} target="_blank" rel="noopener noreferrer">
                      Enviar no WhatsApp
                    </a>
                    <button type="button" className="btn btn-secondary" onClick={() => copiar(c)}>
                      {copiado === c.id ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
