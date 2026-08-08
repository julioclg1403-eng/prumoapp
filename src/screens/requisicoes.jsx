/* ============================================================
   REQUISIÇÕES E PEDIDOS — a lista.

   O rascunho é privado do autor, e isso é regra de BANCO, não
   desta tela: o mestre monta a lista ao longo do dia e a gestão
   só passa a enxergar depois que ele envia. Se a privacidade
   fosse só um filtro daqui, bastaria abrir o app pelo computador
   para ver o que ninguém mandou ainda.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDinheiro, plural,
  situacaoRequisicao, saldosDaRequisicao, filtrarRequisicoes, contarRequisicoes,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Vazio, Indicador,
  BotaoRelatorio, RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

export default function Requisicoes({ goto, perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const gestao = perfil.role !== 'campo'

  const [filtro, setFiltro] = useState(gestao ? 'aguardando' : 'abertas')

  const cont = useMemo(
    () => contarRequisicoes(dados.requisicoes, perfil.id, hoje),
    [dados.requisicoes, perfil.id, hoje],
  )

  const lista = useMemo(() => {
    return filtrarRequisicoes(dados.requisicoes, filtro, perfil.id)
      .slice()
      .sort((a, b) => {
        /* Atrasado primeiro — é o que exige ação hoje. Depois, o
           mais recente. */
        const atrasoA = situacaoRequisicao(a, hoje).atrasada ? 0 : 1
        const atrasoB = situacaoRequisicao(b, hoje).atrasada ? 0 : 1
        if (atrasoA !== atrasoB) return atrasoA - atrasoB
        return (a.created_at < b.created_at ? 1 : -1)
      })
  }, [dados.requisicoes, filtro, perfil.id, hoje])

  const novo = () => goto('requisicao', { novo: true })

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Pedidos de material</div>
          <div className="sub">
            {cont.abertas} em aberto
            {cont.atrasadas > 0 && ` · ${cont.atrasadas} atrasado(s)`}
          </div>
        </div>
        <button onClick={novo} aria-label="Nova requisição"><Icon name="mais_sinal" size={22} /></button>
      </div>

      <div className="page">
        <PageHeader
          titulo="Pedidos de material"
          sub={`${plural(lista.length, 'pedido', 'pedidos')} neste filtro`}
          acao={
            <div className="row-flex">
              {lista.length > 0 && <BotaoRelatorio />}
              <button className="btn btn-primary" onClick={novo}>
                <Icon name="mais_sinal" size={18} /> Nova requisição
              </button>
            </div>
          }
        />

        <div className="stack-2">
          {/* ── O que exige ação ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {gestao && (
              <Indicador
                rotulo="Aguardando você" valor={cont.aguardando}
                tom={cont.aguardando ? 'info' : undefined}
                onClick={() => setFiltro('aguardando')}
              />
            )}
            <Indicador
              rotulo="Em trânsito" valor={cont.transito}
              onClick={() => setFiltro('transito')}
            />
            <Indicador
              rotulo="Atrasados" valor={cont.atrasadas}
              tom={cont.atrasadas ? 'danger' : undefined}
              onClick={() => setFiltro('transito')}
            />
            <Indicador
              rotulo="Entrega parcial" valor={cont.parciais}
              tom={cont.parciais ? 'danger' : undefined}
              onClick={() => setFiltro('transito')}
            />
          </div>

          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'abertas', rotulo: 'Em aberto', contador: cont.abertas },
              ...(gestao ? [{ valor: 'aguardando', rotulo: 'Aguardando', contador: cont.aguardando }] : []),
              { valor: 'transito', rotulo: 'A caminho', contador: cont.transito },
              { valor: 'rascunhos', rotulo: 'Rascunhos', contador: cont.rascunhos },
              { valor: 'recebidas', rotulo: 'Recebidos', contador: cont.recebidas },
              { valor: 'todas', rotulo: 'Todos', contador: cont.total },
            ]}
          />

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nenhum pedido aqui"
                texto={
                  filtro === 'rascunhos'
                    ? 'Rascunho é seu e só seu até você enviar. Monte a lista ao longo do dia e mande quando fechar.'
                    : 'Quando alguém pedir material, o pedido aparece nesta lista e caminha até a entrega.'
                }
                acao={<button className="btn btn-primary" onClick={novo}>Nova requisição</button>}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((r) => (
                <CartaoRequisicao
                  key={r.id} req={r} hoje={hoje} dados={dados} perfil={perfil}
                  onAbrir={() => goto('requisicao', { id: r.id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <RelatorioFolha
        titulo="Pedidos de material" sub={ROTULO_FILTRO_REQ[filtro]}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        <SecaoRelatorio>
          <TabelaRelatorio
            colunas={['Nº', 'Título', 'Status', 'Fornecedor', 'Valor', 'Previsão', '% recebido']}
            linhas={lista.map((r) => {
              const sit = situacaoRequisicao(r, hoje)
              const saldos = saldosDaRequisicao(r)
              return [
                r.numero ?? '—',
                r.titulo || `${plural(saldos.totalItens, 'item', 'itens')}`,
                sit.rotulo,
                r.fornecedor || '—',
                formatarDinheiro(r.valor_total),
                r.previsao_entrega ? formatarData(r.previsao_entrega) : '—',
                saldos.entrega === 'nada' ? '—' : `${saldos.percentual}%`,
              ]
            })}
          />
        </SecaoRelatorio>
      </RelatorioFolha>
    </>
  )
}

const ROTULO_FILTRO_REQ = {
  abertas: 'Em aberto', aguardando: 'Aguardando', transito: 'A caminho',
  rascunhos: 'Rascunhos', recebidas: 'Recebidos', todas: 'Todos',
}

function CartaoRequisicao({ req, hoje, dados, perfil, onAbrir }) {
  const sit = situacaoRequisicao(req, hoje)
  const saldos = saldosDaRequisicao(req)
  const autor = dados.perfilPorId(req.autor_id)
  const meuRascunho = req.status === 'rascunho' && req.autor_id === perfil.id

  return (
    <button
      className="card-tap"
      onClick={onAbrir}
      style={sit.atrasada ? { borderLeft: '4px solid var(--danger)' } : undefined}
    >
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-flex" style={{ gap: 8, marginBottom: 2 }}>
            <span className="t-num t-strong" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              #{req.numero}
            </span>
            <span className="t-strong truncate" style={{ fontSize: 15 }}>
              {req.titulo || `${plural(saldos.totalItens, 'item', 'itens')}`}
            </span>
          </div>

          <div className="t-caption" style={{ marginTop: 2 }}>
            {plural(saldos.totalItens, 'item', 'itens')}
            {req.fornecedor && ` · ${req.fornecedor}`}
            {autor && ` · ${autor.nome}`}
          </div>

          {/* A frase que mais importa numa lista de pedidos: o que
              ainda falta chegar. */}
          {saldos.entrega === 'parcial' && (
            <div className="t-caption" style={{ marginTop: 4, color: 'var(--danger)', fontWeight: 600 }}>
              Entrega parcial — falta{' '}
              {plural(saldos.totalItens - saldos.itensCompletos, 'item', 'itens')}
            </div>
          )}

          {req.previsao_entrega && ['comprada', 'em_transito'].includes(req.status) && (
            <div className="t-caption" style={{ marginTop: 2 }}>
              Previsão {formatarData(req.previsao_entrega)}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <Chip tom={sit.tom}>{meuRascunho ? 'Seu rascunho' : sit.rotulo}</Chip>
          {saldos.entrega !== 'nada' && (
            <div className="t-num" style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
              {saldos.percentual}% recebido
            </div>
          )}
        </div>
      </div>

      {/* Barra de recebimento: dá o estado do pedido num relance,
          sem precisar abrir. */}
      {saldos.entrega !== 'nada' && (
        <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
          <div
            style={{
              width: `${saldos.percentual}%`, height: '100%',
              background: saldos.entrega === 'completa' ? 'var(--success)' : 'var(--info)',
            }}
          />
        </div>
      )}
    </button>
  )
}
