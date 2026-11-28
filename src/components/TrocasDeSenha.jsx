/* Troca de senha, na tela de Usuários: os pedidos de quem esqueceu a
   senha e os links já liberados. Quem cria a senha nova é a própria
   pessoa, pelo link; a antiga vale até lá. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  trocasDeSenha, liberarTroca, cancelarTroca, abrirNoWhatsapp, mensagemDaTroca, quandoVence,
} from '../lib/linkConvite'

export function useTrocasDeSenha() {
  const [lista, setLista] = useState([])
  const [novoId, setNovoId] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await trocasDeSenha()
    if (error) { setErro('Não consegui carregar os pedidos de senha.'); return }
    setErro('')
    setLista(data || [])
  }, [])

  // quem pede avisa pelo WhatsApp; ao voltar para o app, a lista se atualiza
  useEffect(() => {
    carregar()
    const voltou = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => document.removeEventListener('visibilitychange', voltou)
  }, [carregar])

  // recarrega antes de mostrar o erro: carregar() limpa o aviso
  const executar = async (acao, aoDarCerto, prefixo) => {
    setErro(''); setOcupado(true)
    const { data, error } = await acao()
    await carregar()
    setOcupado(false)
    if (error) { setErro(`${prefixo} ${error.message}`); return }
    aoDarCerto?.(data)
  }

  return {
    lista, novoId, ocupado, erro,
    liberar: (usuarioId) => executar(() => liberarTroca(usuarioId), (d) => setNovoId(d?.[0]?.id || null), 'Não consegui liberar.'),
    cancelar: (id) => executar(() => cancelarTroca(id), null, 'Não consegui cancelar.'),
  }
}

export default function TrocasDeSenha({ trocas, empresa }) {
  const { lista, novoId, ocupado, erro, liberar, cancelar } = trocas
  const [copiado, setCopiado] = useState(null)
  const [erroCopia, setErroCopia] = useState('')
  const caixa = useRef(null)

  // quem liberou pelo cartão de uma pessoa, lá embaixo, é levado até o link
  useEffect(() => {
    if (novoId) caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [novoId])

  if (!lista.length && !erro) return null

  const mensagem = (t) => mensagemDaTroca({ nome: t.nome, empresa, codigo: t.codigo, expiraEm: t.expira_em })

  const copiar = async (t) => {
    setErroCopia('')
    try {
      await navigator.clipboard.writeText(mensagem(t))
      setCopiado(t.id)
    } catch { setErroCopia('Não consegui copiar. Use o botão do WhatsApp.') }
  }

  return (
    <div ref={caixa} style={{ scrollMarginTop: 70 }}>
      <div className="t-micro" style={{ marginBottom: 10 }}>Troca de senha</div>
      {(erro || erroCopia) && <div className="alert danger" style={{ marginBottom: 10 }}>{erro || erroCopia}</div>}
      <div className="stack-1">
        {lista.map((t) => (
          <div key={t.id} className="card-flat" style={{ borderLeft: `4px solid var(${t.codigo ? '--info' : '--primary'})` }}>
            <div className="t-strong" style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{t.nome || 'Sem nome'}</div>
            <div className="t-caption" style={{ overflowWrap: 'anywhere' }}>{t.email}</div>
            <div className="t-caption" style={{ marginTop: 2 }}>
              {t.codigo ? `Liberada. O link vale até ${quandoVence(t.expira_em)}.` : `Pediu uma senha nova em ${quandoVence(t.pedido_em)}.`}
            </div>
            {t.codigo ? (
              <>
                <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
                  <a className="btn btn-primary grow" href={abrirNoWhatsapp(mensagem(t))} target="_blank" rel="noopener noreferrer">
                    Enviar no WhatsApp
                  </a>
                  <button type="button" className="btn btn-secondary" onClick={() => copiar(t)}>
                    {copiado === t.id ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => cancelar(t.id)} disabled={ocupado}>Cancelar link</button>
              </>
            ) : (
              <>
                <div className="t-caption" style={{ margin: '8px 0 10px' }}>
                  Qualquer pessoa pode pedir informando um e-mail. Confirme com a pessoa antes de liberar.
                </div>
                <div className="row-flex" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-primary grow" onClick={() => liberar(t.usuario)} disabled={ocupado}>Liberar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => cancelar(t.id)} disabled={ocupado}>Recusar</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
