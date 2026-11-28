/* "Convidar pessoa", na tela de Usuários (só o administrador chega lá). */
import { useCallback, useEffect, useState } from 'react'
import { listarConvites, convidar, cancelarConvite } from '../lib/convites'
import { Campo } from '.'

const quando = (iso) => new Date(iso).toLocaleDateString('pt-BR')

export default function Convites({ organizationId, obras, obraPadrao, papeis }) {
  const [lista, setLista] = useState([])
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('campo')
  const [obraId, setObraId] = useState(obraPadrao || obras[0]?.id || '')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await listarConvites()
    if (error) { setErro('Não consegui carregar os convites.'); return }
    setLista(data || [])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const enviar = async (e) => {
    e.preventDefault()
    setErro(''); setAviso('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Confira o e-mail.'); return }
    setOcupado(true)
    const { error } = await convidar({ organizationId, email, papel, obraId })
    setOcupado(false)
    if (error) { setErro(`Não consegui convidar. ${error.message}`); return }
    setAviso(`Convite criado. O app não envia e-mail sozinho: peça para a pessoa abrir o Prumo, criar a conta com ${email.trim().toLowerCase()}, confirmar o e-mail e tocar em aceitar. Vale por 7 dias.`)
    setEmail('')
    carregar()
  }

  const cancelar = async (id) => {
    setOcupado(true)
    const { error } = await cancelarConvite(id)
    setOcupado(false)
    if (error) setErro('Não consegui cancelar o convite.')
    carregar()
  }

  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 10 }}>Convidar pessoa</div>
      <form className="card-flat" onSubmit={enviar}>
        <div className="stack-2">
          <Campo label="E-mail da pessoa">
            <input className="ipt" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" />
          </Campo>
          <Campo label="Perfil de acesso">
            <select className="ipt" value={papel} onChange={(e) => setPapel(e.target.value)}>
              {papeis.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </Campo>
          <Campo label="Obra">
            <select className="ipt" value={obraId} onChange={(e) => setObraId(e.target.value)}>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Campo>
          {erro && <div className="alert danger">{erro}</div>}
          {aviso && <div className="alert info">{aviso}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={ocupado || !email.trim()}>Convidar</button>
        </div>
      </form>

      {lista.length > 0 && (
        <div className="stack-1" style={{ marginTop: 10 }}>
          {lista.map((c) => (
            <div key={c.id} className="card-flat" style={{ borderLeft: '4px solid var(--info)' }}>
              <div className="row-between" style={{ gap: 8, alignItems: 'center' }}>
                <div className="grow">
                  <div className="t-strong" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{c.email}</div>
                  <div className="t-caption">
                    {papeis.find((p) => p.valor === c.role)?.rotulo} · {new Date(c.expira_em) < new Date() ? 'vencido em' : 'vale até'} {quando(c.expira_em)}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelar(c.id)} disabled={ocupado}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
