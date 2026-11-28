/* O lado de quem recebeu o link: ver de qual empresa é, pedir a
   liberação e esperar. Fica na tela de quem ainda não tem empresa. */
import { useCallback, useEffect, useState } from 'react'
import { verLink, pedirEntrada, meusPedidos, esquecerCodigo, abrirNoWhatsapp, mensagemDeEspera } from '../lib/linkConvite'

const NOME_DO_PERFIL = { campo: 'Campo', gestao: 'Gestão' }

export default function PedidoPorLink({ codigo, aoAchar, aoVerificar }) {
  const [pedidos, setPedidos] = useState([])
  const [link, setLink] = useState(null) // { empresa, papel, situacao } | { situacao: 'invalido' }
  const [carregou, setCarregou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [conferido, setConferido] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const [p, l] = await Promise.all([meusPedidos(), codigo ? verLink(codigo) : { data: null }])
    setCarregou(true)
    if (p.error || l.error) {
      console.error('[Prumo] convite por link:', p.error || l.error)
      if (codigo) setErro('Não consegui conferir o convite. Toque em "Verificar de novo".')
      return
    }
    setErro('')
    setPedidos(p.data || [])
    setLink(codigo ? (l.data?.[0] || { situacao: 'invalido' }) : null)
    if (p.data?.length) aoAchar?.()
  }, [codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  // recarrega o perfil também: se já foi liberado, o app entra sozinho
  const verificar = useCallback(async () => {
    aoVerificar?.()
    await carregar()
  }, [aoVerificar, carregar])

  useEffect(() => { carregar() }, [carregar])

  const esperando = pedidos.filter((p) => p.situacao === 'aguardando')
  const temEspera = esperando.length > 0

  // quem foi avisar o administrador e voltou não precisa tocar em nada
  useEffect(() => {
    if (!temEspera) return undefined
    const voltou = () => { if (document.visibilityState === 'visible') verificar() }
    document.addEventListener('visibilitychange', voltou)
    return () => document.removeEventListener('visibilitychange', voltou)
  }, [temEspera, verificar])

  const pedir = async () => {
    setErro(''); setOcupado(true)
    const { error } = await pedirEntrada(codigo)
    setOcupado(false)
    // recarrega primeiro: carregar() limpa o aviso, e o motivo precisa ficar na tela
    if (error) { await carregar(); setErro(error.message); return }
    esquecerCodigo()
    await carregar()
  }

  const tocouEmVerificar = async () => {
    setOcupado(true); setConferido(false)
    await verificar()
    setOcupado(false); setConferido(true)
  }

  const disponivel = link?.situacao === 'disponivel'
  const recusado = !temEspera && !disponivel && pedidos.find((p) => p.situacao === 'recusado')
  const vencido = !temEspera && !disponivel && !recusado
    && (pedidos.some((p) => p.situacao === 'vencido') || link?.situacao === 'vencido')
  const naoVale = !temEspera && !recusado && !vencido && (link?.situacao === 'usado' || link?.situacao === 'invalido')

  return (
    <>
      {codigo && !carregou && <div className="card" style={{ marginBottom: 14 }}><div className="t-caption">Conferindo o convite…</div></div>}

      {esperando.map((p) => (
        <div key={p.id} className="card" style={{ marginBottom: 14 }}>
          <div className="t-strong" style={{ fontSize: 16 }}>Pedido enviado</div>
          <div className="t-caption" style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
            Aguardando o administrador de <strong>{p.empresa}</strong> liberar o seu acesso como {NOME_DO_PERFIL[p.papel] || p.papel}.
          </div>
          <a className="btn btn-primary btn-block" href={abrirNoWhatsapp(mensagemDeEspera({ empresa: p.empresa }))} target="_blank" rel="noopener noreferrer">
            Avisar no WhatsApp
          </a>
        </div>
      ))}

      {disponivel && !temEspera && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="t-strong" style={{ fontSize: 16 }}>Convite de {link.empresa}</div>
          <div className="t-caption" style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
            Perfil de acesso: {NOME_DO_PERFIL[link.papel] || link.papel}. Peça só se você conhece essa empresa.
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={pedir} disabled={ocupado}>
            Pedir liberação
          </button>
        </div>
      )}

      {recusado && (
        <div className="alert danger" style={{ marginBottom: 14 }}>
          O administrador de {recusado.empresa} não liberou o seu pedido. Se foi engano, peça um convite novo.
        </div>
      )}
      {vencido && <div className="alert danger" style={{ marginBottom: 14 }}>O convite venceu. Peça um novo ao administrador.</div>}
      {naoVale && <div className="alert danger" style={{ marginBottom: 14 }}>Este convite já foi usado ou foi cancelado. Peça um novo ao administrador.</div>}
      {erro && <div className="alert danger" style={{ marginBottom: 14 }}>{erro}</div>}

      {(temEspera || codigo || pedidos.length > 0) && carregou && (
        <div style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={tocouEmVerificar} disabled={ocupado}>
            {ocupado ? 'Aguarde…' : 'Verificar de novo'}
          </button>
          {conferido && temEspera && (
            <div className="t-caption" style={{ color: 'var(--on-graphite-2)', textAlign: 'center', marginTop: 6 }}>Ainda não foi liberado.</div>
          )}
        </div>
      )}
    </>
  )
}
