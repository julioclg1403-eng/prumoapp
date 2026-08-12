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
  hojeISO, somarDias, formatarData, formatarDataCurta, nomeDiaSemana,
  diarioDaData, situacaoDiario, totalPresentes, progressoDiario, plural,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Vazio, ItemLista, CalendarioMes } from '../components'

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 0, rotulo: 'Tudo' },
]

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
          sub={aba === 'lista' ? `${plural(lista.length, 'registro', 'registros')} no período` : dados.obra.nome}
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
            <CalendarioMes
              mes={mes} onMudarMes={setMes} hoje={hoje}
              obterMarca={(iso) => {
                const d = diarioDaData(diariosDaObra, iso, dados.obra.id)
                if (!d) return null
                const s = situacaoDiario(d)
                return { rotulo: s.rotulo, tom: s.chave === 'finalizado' ? 'success' : 'info' }
              }}
              onClicarDia={(iso) => goto('diario', { data: iso, id: diarioDaData(diariosDaObra, iso, dados.obra.id)?.id })}
            />
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
