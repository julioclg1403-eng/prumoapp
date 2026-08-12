/* ============================================================
   HISTÓRICO DE DIÁRIOS
   Entrada em calendário (pedido do Julio, no modelo de um site de
   referência): o mês inteiro de relance, com o dia marcado quando
   tem diário lançado. A lista antiga continua — vira uma segunda
   aba, porque o filtro por período/rascunho ainda é útil.
   Diário duplicado na mesma data é impossível: o clique sempre abre
   o registro existente daquela data.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, paraISO, formatarData, formatarDataCurta, nomeDiaSemana,
  diarioDaData, situacaoDiario, totalPresentes, progressoDiario, plural,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Vazio, ItemLista } from '../components'

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 0, rotulo: 'Tudo' },
]

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/* Sempre 6 semanas (42 dias), começando no domingo da semana do dia
   1 — é o que faz o grid ficar retangular e previsível mês a mês,
   igual ao modelo. `mesISO` é só "AAAA-MM". */
function gradeDoMes(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number)
  const primeiro = new Date(ano, mes - 1, 1)
  const inicio = new Date(ano, mes - 1, 1 - primeiro.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return { iso: paraISO(d), dia: d.getDate(), doMes: d.getMonth() === mes - 1 }
  })
}

function somarMeses(mesISO, n) {
  const [ano, mes] = mesISO.split('-').map(Number)
  const d = new Date(ano, mes - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Diarios({ goto }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [aba, setAba] = useState('calendario')
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [periodo, setPeriodo] = useState(30)
  const [somenteRascunho, setSomenteRascunho] = useState(false)

  const diariosDaObra = useMemo(
    () => dados.diarios.filter((d) => d.worksite_id === dados.obra.id),
    [dados.diarios, dados.obra.id],
  )

  const lista = useMemo(() => {
    const limite = periodo ? somarDias(hoje, -periodo + 1) : null
    return diariosDaObra
      .filter((d) => (limite ? d.data >= limite : true))
      .filter((d) => (somenteRascunho ? d.status === 'rascunho' : true))
      .sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [diariosDaObra, periodo, somenteRascunho, hoje])

  const grade = useMemo(() => gradeDoMes(mes), [mes])
  const rotuloMes = useMemo(() => {
    const [ano, m] = mes.split('-').map(Number)
    const texto = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return texto.charAt(0).toUpperCase() + texto.slice(1)
  }, [mes])

  const diarioHoje = diarioDaData(dados.diarios, hoje, dados.obra.id)
  const rascunhos = dados.diarios.filter((d) => d.status === 'rascunho').length

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Diário de obra</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader
          titulo="Diários"
          sub={aba === 'lista' ? `${plural(lista.length, 'registro', 'registros')} no período` : rotuloMes}
          acao={
            <button
              className="btn btn-primary"
              onClick={() => goto('diario', { data: hoje, id: diarioHoje?.id })}
            >
              <Icon name="mais_sinal" size={18} />
              {diarioHoje ? 'Abrir hoje' : 'Lançar hoje'}
            </button>
          }
        />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[{ valor: 'calendario', rotulo: 'Calendário' }, { valor: 'lista', rotulo: 'Lista' }]}
          />

          {!diarioHoje && (
            <div className="alert danger">
              O diário de <strong>hoje ({formatarData(hoje)})</strong> ainda não foi lançado.
            </div>
          )}

          {aba === 'calendario' ? (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="row-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setMes(hoje.slice(0, 7))}>Hoje</button>
                <div className="row-flex" style={{ gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setMes((m) => somarMeses(m, -1))}>
                    <Icon name="voltar" size={16} />
                  </button>
                  <div className="t-strong" style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }}>{rotuloMes}</div>
                  <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setMes((m) => somarMeses(m, 1))}>
                    <Icon name="avancar" size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
                {DIAS_SEMANA.map((n) => (
                  <div key={n} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                    <span className="calendario-dia-semana-curto">{n.slice(0, 3)}</span>
                    <span className="calendario-dia-semana-longo">{n}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {grade.map((c) => {
                  const d = diarioDaData(diariosDaObra, c.iso, dados.obra.id)
                  const s = situacaoDiario(d)
                  const ehHoje = c.iso === hoje
                  return (
                    <button
                      key={c.iso}
                      onClick={() => c.doMes && goto('diario', { data: c.iso, id: d?.id })}
                      disabled={!c.doMes}
                      style={{
                        aspectRatio: '1', minHeight: 64, border: '1px solid var(--border)', borderRight: 0, borderBottom: 0,
                        background: 'var(--surface)', cursor: c.doMes ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch', boxSizing: 'border-box',
                        width: '100%', minWidth: 0,
                        padding: 6, fontFamily: 'var(--font)', textAlign: 'left', position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13, fontWeight: ehHoje ? 700 : 500,
                          color: !c.doMes ? 'var(--text-3)' : ehHoje ? 'var(--primary)' : 'var(--text)',
                          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 999, border: ehHoje ? '1.5px solid var(--primary)' : 'none',
                        }}
                      >
                        {c.dia}
                      </span>
                      <span className="grow" />
                      {c.doMes && d && (
                        <span
                          style={{
                            fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '3px 2px', borderRadius: 5,
                            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', overflow: 'hidden',
                            background: s.chave === 'finalizado' ? 'var(--success)' : 'var(--info)',
                          }}
                        >
                          {/* Cabe "Finalizado" inteiro só quando a célula é larga (desktop);
                              no celular a coluna mal cabe o número do dia. */}
                          <span className="calendario-dia-semana-curto">✓</span>
                          <span className="calendario-dia-semana-longo">{s.rotulo}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="row-between" style={{ flexWrap: 'wrap' }}>
                <Segmentos opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
                <button
                  className={`btn btn-sm ${somenteRascunho ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => setSomenteRascunho((v) => !v)}
                  aria-pressed={somenteRascunho}
                >
                  Só rascunhos {rascunhos > 0 && <span style={{ opacity: 0.7 }}>{rascunhos}</span>}
                </button>
              </div>

              {lista.length === 0 ? (
                <div className="card-flat">
                  <Vazio
                    titulo="Nenhum diário no período"
                    texto="Aumente o período ou lance o diário de hoje para começar o histórico."
                    acao={
                      <button className="btn btn-primary" onClick={() => goto('diario', { data: hoje })}>
                        Lançar o diário de hoje
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="stack-1">
                  {lista.map((d) => {
                    const s = situacaoDiario(d)
                    const pr = progressoDiario(d)
                    const ocorrencias = (d.ocorrencias || []).length
                    return (
                      <ItemLista
                        key={d.id}
                        titulo={
                          <span>
                            {formatarDataCurta(d.data)}
                            <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 8, textTransform: 'capitalize' }}>
                              {nomeDiaSemana(d.data)}
                            </span>
                          </span>
                        }
                        sub={
                          `${plural(totalPresentes(d), 'pessoa', 'pessoas')} · ` +
                          `${pr.concluidas}/${pr.total} frentes` +
                          (ocorrencias ? ` · ${plural(ocorrencias, 'ocorrência', 'ocorrências')}` : '')
                        }
                        direita={<Chip tom={s.tom}>{s.rotulo}</Chip>}
                        onClick={() => goto('diario', { data: d.data, id: d.id })}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
