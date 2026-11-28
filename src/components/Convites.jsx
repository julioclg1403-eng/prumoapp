/* Convites, na tela de Usuários (só o administrador chega lá):
   pedidos esperando liberação, link novo para mandar no WhatsApp e
   os links que ainda não foram usados. */
import { useCallback, useEffect, useState } from 'react'
import { listarConvites, cancelarConvite } from '../lib/convites'
import {
  listarLinksAbertos, criarLink, cancelarLink, pedidosDeEntrada, liberarPedido, recusarPedido,
  abrirNoWhatsapp, mensagemDoConvite, mensagemDeLiberado,
} from '../lib/linkConvite'
import { Campo } from '.'

const quando = (iso) => new Date(iso).toLocaleDateString('pt-BR')

export default function Convites({ empresa, obras, obraPadrao, papeis, aoLiberar }) {
  const papeisDoLink = papeis.filter((p) => p.valor !== 'admin')
  const rotuloPapel = (v) => papeis.find((p) => p.valor === v)?.rotulo || v
  const nomeObra = (id) => obras.find((o) => o.id === id)?.nome

  const [pedidos, setPedidos] = useState([])
  const [links, setLinks] = useState([])
  const [porEmail, setPorEmail] = useState([]) // convites antigos, por e-mail, ainda em aberto
  const [papel, setPapel] = useState('campo')
  const [obraId, setObraId] = useState(obraPadrao || obras[0]?.id || '')
  const [novoId, setNovoId] = useState(null)
  const [liberado, setLiberado] = useState(null) // nome de quem acabou de ser liberado
  const [copiado, setCopiado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const [p, l, e] = await Promise.all([pedidosDeEntrada(), listarLinksAbertos(), listarConvites()])
    if (p.error || l.error) { setErro('Não consegui carregar os convites.'); return }
    setErro('')
    setPedidos(p.data || [])
    setLinks(l.data || [])
    // o convite antigo é só uma sobra: se falhar, a tela segue sem ele
    setPorEmail(e.data || [])
  }, [])

  /* Quem pede avisa pelo WhatsApp; ao voltar para o app, a lista se
     atualiza sozinha. */
  useEffect(() => {
    carregar()
    const voltou = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', voltou)
    window.addEventListener('focus', voltou)
    return () => {
      document.removeEventListener('visibilitychange', voltou)
      window.removeEventListener('focus', voltou)
    }
  }, [carregar])

  const criar = async (e) => {
    e.preventDefault()
    setErro(''); setLiberado(null); setOcupado(true)
    const { data, error } = await criarLink({ papel, obraId })
    setOcupado(false)
    if (error) { setErro(`Não consegui criar o convite. ${error.message}`); return }
    setNovoId(data?.[0]?.id || null)
    await carregar()
  }

  const responder = async (pedido, liberar) => {
    setErro(''); setLiberado(null); setOcupado(true)
    const { error } = await (liberar ? liberarPedido : recusarPedido)(pedido.id)
    setOcupado(false)
    await carregar()
    if (error) { setErro(error.message); return }
    if (liberar) {
      setLiberado(pedido.nome || pedido.email)
      aoLiberar?.()
    }
  }

  const apagar = async (apagador, id) => {
    setOcupado(true)
    const { error } = await apagador(id)
    setOcupado(false)
    await carregar()
    if (error) setErro('Não consegui cancelar o convite.')
  }

  const copiar = async (l) => {
    try {
      await navigator.clipboard.writeText(mensagemDoConvite({ empresa, codigo: l.codigo, expiraEm: l.expira_em }))
      setCopiado(l.id)
    } catch { setErro('Não consegui copiar. Use o botão do WhatsApp.') }
  }

  return (
    <div className="stack-3">
      {erro && <div className="alert danger">{erro}</div>}

      {liberado && (
        <div className="card-flat">
          <div className="alert success" style={{ marginBottom: 10 }}>{liberado} agora tem acesso.</div>
          <a className="btn btn-secondary btn-block" href={abrirNoWhatsapp(mensagemDeLiberado({ empresa }))} target="_blank" rel="noopener noreferrer">
            Avisar no WhatsApp
          </a>
        </div>
      )}

      {pedidos.length > 0 && (
        <div>
          <div className="t-micro" style={{ marginBottom: 10 }}>Pedidos de entrada ({pedidos.length})</div>
          <div className="stack-1">
            {pedidos.map((p) => (
              <div key={p.id} className="card-flat" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="t-strong" style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{p.nome || 'Sem nome'}</div>
                <div className="t-caption" style={{ overflowWrap: 'anywhere' }}>{p.email}</div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {rotuloPapel(p.papel)} · {nomeObra(p.worksite_id) || 'primeira obra'} · pediu em {quando(p.pedido_em)}
                </div>
                <div className="t-caption" style={{ margin: '8px 0 10px' }}>Libere só se você reconhece esta pessoa e este e-mail.</div>
                <div className="row-flex" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-primary grow" onClick={() => responder(p, true)} disabled={ocupado}>Liberar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => responder(p, false)} disabled={ocupado}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="t-micro" style={{ marginBottom: 10 }}>Convidar pelo WhatsApp</div>
        <form className="card-flat" onSubmit={criar}>
          <div className="stack-2">
            <Campo label="Perfil de acesso">
              <select className="ipt" value={papel} onChange={(e) => setPapel(e.target.value)}>
                {papeisDoLink.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </Campo>
            <Campo label="Obra">
              <select className="ipt" value={obraId} onChange={(e) => setObraId(e.target.value)}>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </Campo>
            <button className="btn btn-primary btn-block" type="submit" disabled={ocupado}>Criar convite</button>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Cada convite vale para uma pessoa, por 7 dias. Quem receber ainda precisa da sua liberação aqui.
            </div>
          </div>
        </form>

        {links.length > 0 && (
          <div className="stack-1" style={{ marginTop: 10 }}>
            {links.map((l) => {
              const vencido = new Date(l.expira_em) < new Date()
              return (
                <div key={l.id} className="card-flat" style={{ borderLeft: `4px solid var(${l.id === novoId ? '--primary' : '--info'})` }}>
                  <div className="row-between" style={{ gap: 8, alignItems: 'center' }}>
                    <div className="grow">
                      <div className="t-strong" style={{ fontSize: 14 }}>
                        {l.id === novoId ? 'Convite pronto para enviar' : 'Convite ainda não usado'}
                      </div>
                      <div className="t-caption">
                        {rotuloPapel(l.role)} · {nomeObra(l.worksite_id) || 'primeira obra'} · {vencido ? 'vencido em' : 'vale até'} {quando(l.expira_em)}
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => apagar(cancelarLink, l.id)} disabled={ocupado}>Cancelar</button>
                  </div>
                  {!vencido && (
                    <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
                      <a className="btn btn-primary grow" href={abrirNoWhatsapp(mensagemDoConvite({ empresa, codigo: l.codigo, expiraEm: l.expira_em }))} target="_blank" rel="noopener noreferrer">
                        Enviar no WhatsApp
                      </a>
                      <button type="button" className="btn btn-secondary" onClick={() => copiar(l)}>
                        {copiado === l.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {porEmail.length > 0 && (
        <div>
          <div className="t-micro" style={{ marginBottom: 10 }}>Convites por e-mail em aberto</div>
          <div className="stack-1">
            {porEmail.map((c) => (
              <div key={c.id} className="card-flat">
                <div className="row-between" style={{ gap: 8, alignItems: 'center' }}>
                  <div className="grow">
                    <div className="t-strong" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{c.email}</div>
                    <div className="t-caption">
                      {rotuloPapel(c.role)} · {new Date(c.expira_em) < new Date() ? 'vencido em' : 'vale até'} {quando(c.expira_em)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => apagar(cancelarConvite, c.id)} disabled={ocupado}>Cancelar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
