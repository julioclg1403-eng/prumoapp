/* ============================================================
   HISTÓRICO DE DIÁRIOS
   Lista por data, mostra o que ficou em rascunho e abre o
   assistente. Diário duplicado na mesma data é impossível: a
   lista sempre abre o registro existente daquela data.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDataCurta, nomeDiaSemana,
  diarioDaData, situacaoDiario, totalPresentes, progressoDiario, plural,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Vazio, ItemLista } from '../components'

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 0, rotulo: 'Tudo' },
]

export default function Diarios({ goto }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [periodo, setPeriodo] = useState(30)
  const [somenteRascunho, setSomenteRascunho] = useState(false)

  const lista = useMemo(() => {
    const limite = periodo ? somarDias(hoje, -periodo + 1) : null
    return dados.diarios
      .filter((d) => d.worksite_id === dados.obra.id)
      .filter((d) => (limite ? d.data >= limite : true))
      .filter((d) => (somenteRascunho ? d.status === 'rascunho' : true))
      .sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [dados.diarios, dados.obra.id, periodo, somenteRascunho, hoje])

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
          sub={`${plural(lista.length, 'registro', 'registros')} no período`}
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

          {!diarioHoje && (
            <div className="alert danger">
              O diário de <strong>hoje ({formatarData(hoje)})</strong> ainda não foi lançado.
            </div>
          )}

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
        </div>
      </div>
    </>
  )
}
