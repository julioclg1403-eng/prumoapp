/* ============================================================
   EFETIVO
   Ninguém digita efetivo aqui. Esta tela é a CONSOLIDAÇÃO das
   presenças lançadas nos diários — mesma função de cálculo que
   alimenta o Início e os contadores (lib/dominio.js). É isso que
   impede o painel dizer 14 e esta tela dizer 12.

   A segunda aba é a fila de revisão: quem foi cadastrado às
   pressas dentro do diário entra provisório e precisa da
   conferência da gestão antes de virar cadastro definitivo.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDataCurta, nomeDiaSemana,
  consolidarEfetivo, efetivoPorEmpresa, pendentesDeRevisao, plural,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Vazio, Indicador, ItemLista, useDesktop } from '../components'

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 15, rotulo: '15 dias' },
  { valor: 30, rotulo: '30 dias' },
]

export default function Efetivo({ goto, perfil, params = {} }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()
  const [aba, setAba] = useState(params.aba === 'revisao' ? 'revisao' : 'efetivo')
  const [periodo, setPeriodo] = useState(7)
  const [empresaId, setEmpresaId] = useState('')

  const de = somarDias(hoje, -periodo + 1)
  const gestor = perfil.role !== 'campo'

  const resumo = useMemo(
    () => consolidarEfetivo(dados.diarios, { de, ate: hoje, empresaId: empresaId || undefined }),
    [dados.diarios, de, hoje, empresaId],
  )

  const porEmpresa = useMemo(
    () => efetivoPorEmpresa(dados.diarios, dados.empresas, { de, ate: hoje }),
    [dados.diarios, dados.empresas, de, hoje],
  )

  const revisoes = pendentesDeRevisao(dados.colaboradores)

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Efetivo</div>
          <div className="sub">{formatarData(de)} a {formatarData(hoje)}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader
          titulo="Efetivo"
          sub="Consolidado a partir das presenças lançadas nos diários"
        />

        {gestor && (
          <div style={{ marginBottom: 16 }}>
            <Segmentos
              valor={aba}
              onChange={setAba}
              opcoes={[
                { valor: 'efetivo', rotulo: 'Consolidado' },
                { valor: 'revisao', rotulo: 'Revisão de cadastros', contador: revisoes.length },
              ]}
            />
          </div>
        )}

        {aba === 'efetivo' || !gestor ? (
          <div className="stack-3">
            <div className="row-between" style={{ flexWrap: 'wrap' }}>
              <Segmentos opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
              <select
                className="sel" style={{ width: 'auto', minWidth: 190, height: 38 }}
                value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}
              >
                <option value="">Todas as empresas</option>
                {dados.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <Indicador rotulo="Homem-dia" valor={resumo.total} />
              <Indicador rotulo="Média/dia" valor={resumo.media} />
              <Indicador rotulo="Pico" valor={resumo.pico} />
              <Indicador rotulo="Dias lançados" valor={`${resumo.diasComLancamento}/${periodo}`} />
            </div>

            {resumo.diasComLancamento < periodo && (
              <div className="alert danger">
                {plural(periodo - resumo.diasComLancamento, 'dia do período está', 'dias do período estão')} sem
                lançamento de presença. O número acima só conta o que foi lançado.
              </div>
            )}

            {/* ── Por dia ── */}
            <div>
              <div className="t-micro" style={{ marginBottom: 10 }}>Por dia</div>
              {resumo.dias.length === 0 ? (
                <div className="card-flat">
                  <Vazio titulo="Sem lançamento no período" texto="Lance um diário para o efetivo aparecer aqui." />
                </div>
              ) : desktop ? (
                <div className="card-flat scroll-x" style={{ padding: 0 }}>
                  <table className="tbl">
                    <thead>
                      <tr><th>Data</th><th>Dia</th><th>Presentes</th><th>Empresas</th><th /></tr>
                    </thead>
                    <tbody>
                      {resumo.dias.map((d) => (
                        <tr key={d.data}>
                          <td className="t-strong">{formatarData(d.data)}</td>
                          <td style={{ textTransform: 'capitalize', color: 'var(--text-2)' }}>{nomeDiaSemana(d.data)}</td>
                          <td className="t-num t-strong">{d.total}</td>
                          <td style={{ color: 'var(--text-2)' }}>{resumirEmpresas(d.presentes, dados)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => goto('diario', { data: d.data, id: d.diarioId })}>
                              Abrir diário <Icon name="avancar" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="stack-1">
                  {resumo.dias.map((d) => (
                    <ItemLista
                      key={d.data}
                      titulo={`${formatarDataCurta(d.data)} · ${nomeDiaSemana(d.data)}`}
                      sub={resumirEmpresas(d.presentes, dados)}
                      direita={<span className="t-num t-strong" style={{ fontSize: 18 }}>{d.total}</span>}
                      onClick={() => goto('diario', { data: d.data, id: d.diarioId })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Por empresa ── */}
            {porEmpresa.length > 0 && (
              <div>
                <div className="t-micro" style={{ marginBottom: 10 }}>Por empresa no período</div>
                <div className="card-flat stack-2">
                  {porEmpresa.map(({ empresa, total, media }) => (
                    <div key={empresa.id}>
                      <div className="row-between" style={{ marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{empresa.nome}</span>
                        <span className="t-caption">
                          <span className="t-num t-strong" style={{ color: 'var(--text)' }}>{total}</span> homem-dia · média {media}
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${(total / porEmpresa[0].total) * 100}%`,
                            height: '100%', background: 'var(--graphite)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <FilaDeRevisao />
        )}
      </div>
    </>
  )
}

function resumirEmpresas(presentes, dados) {
  const mapa = {}
  presentes.forEach((p) => { mapa[p.company_id] = (mapa[p.company_id] || 0) + 1 })
  const partes = Object.entries(mapa).map(([id, n]) => `${dados.nomeDe(dados.empresas, id)} ${n}`)
  return partes.join(' · ') || '—'
}

/* ============================================================
   Fila de revisão de colaboradores
   ============================================================ */

function FilaDeRevisao() {
  const dados = useDados()
  const [editando, setEditando] = useState(null)
  const [mesclando, setMesclando] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const fila = pendentesDeRevisao(dados.colaboradores)

  const confirmar = async () => {
    if (!editando?.nome?.trim()) return
    setOcupado(true)
    await dados.revisarColaborador(editando.id, {
      nome: editando.nome.trim(),
      funcao: (editando.funcao || '').trim() || null,
      company_id: editando.company_id,
      documento_conferido: Boolean(editando.documento_conferido),
    })
    setOcupado(false)
    setEditando(null)
  }

  const mesclar = async (mantidoId) => {
    setOcupado(true)
    await dados.mesclarColaborador(mesclando.id, mantidoId)
    setOcupado(false)
    setMesclando(null)
  }

  const candidatos = mesclando
    ? dados.colaboradores.filter((c) => c.id !== mesclando.id && c.ativo !== false && !c.provisorio)
    : []

  return (
    <div className="stack-3">
      <div className="alert info">
        Quem é cadastrado durante o diário entra como <strong>provisório</strong>: o mestre não para a obra
        para conferir documento. A gestão confere aqui, corrige o nome e — se for a mesma pessoa já
        cadastrada com outra grafia — mescla os dois sem perder o histórico de presença.
      </div>

      {fila.length === 0 ? (
        <div className="card-flat">
          <Vazio titulo="Fila vazia" texto="Nenhum cadastro provisório aguardando conferência." />
        </div>
      ) : (
        <div className="stack-1">
          {fila.map((c) => (
            <div key={c.id} className="card-flat" style={{ borderLeft: '4px solid var(--info)' }}>
              <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                <div className="grow">
                  <div className="t-strong" style={{ fontSize: 15 }}>{c.nome}</div>
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    {c.funcao || 'Função não informada'} · {dados.nomeDe(dados.empresas, c.company_id)}
                  </div>
                  <div className="t-caption" style={{ marginTop: 4, color: 'var(--text-3)' }}>
                    Cadastrado em {formatarData(c.criado_em)} por{' '}
                    {dados.perfilPorId(c.criado_por)?.nome || 'usuário do campo'}
                  </div>
                </div>
                <Chip tom="info">Provisório</Chip>
              </div>
              <div className="row-flex">
                <button className="btn btn-primary btn-sm grow" onClick={() => setEditando({ ...c })}>
                  Conferir e aprovar
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setMesclando(c)}>
                  É duplicado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Conferência ── */}
      <Sheet
        aberto={Boolean(editando)}
        titulo="Conferir cadastro"
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={confirmar}
              disabled={ocupado || !editando?.nome?.trim()}
            >
              {ocupado ? 'Salvando…' : 'Aprovar cadastro'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Nome completo">
            <input
              className="ipt" value={editando?.nome || ''}
              onChange={(e) => setEditando((c) => ({ ...c, nome: e.target.value }))}
            />
          </Campo>
          <Campo label="Função">
            <input
              className="ipt" value={editando?.funcao || ''}
              onChange={(e) => setEditando((c) => ({ ...c, funcao: e.target.value }))}
            />
          </Campo>
          <Campo label="Empresa">
            <select
              className="sel" value={editando?.company_id || ''}
              onChange={(e) => setEditando((c) => ({ ...c, company_id: e.target.value }))}
            >
              {dados.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          <label className="pick" data-on={editando?.documento_conferido ? '1' : '0'} style={{ cursor: 'pointer' }}>
            <input
              type="checkbox" style={{ display: 'none' }}
              checked={Boolean(editando?.documento_conferido)}
              onChange={(e) => setEditando((c) => ({ ...c, documento_conferido: e.target.checked }))}
            />
            <span className="box"><Icon name="check" size={14} /></span>
            <span className="grow">Documentação conferida</span>
          </label>
        </div>
      </Sheet>

      {/* ── Mesclagem ── */}
      <Sheet
        aberto={Boolean(mesclando)}
        titulo="Mesclar cadastro duplicado"
        onFechar={() => setMesclando(null)}
      >
        <div className="t-caption" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Escolha o cadastro <strong>correto</strong>. As presenças já lançadas para
          «{mesclando?.nome}» passam para ele, e o duplicado é arquivado — nada é apagado.
        </div>
        <div className="stack-1">
          {candidatos.length === 0 ? (
            <Vazio titulo="Nenhum candidato" texto="Não há cadastro definitivo para receber a mesclagem." />
          ) : (
            candidatos.map((c) => (
              <ItemLista
                key={c.id}
                titulo={c.nome}
                sub={`${c.funcao || '—'} · ${dados.nomeDe(dados.empresas, c.company_id)}`}
                onClick={() => !ocupado && mesclar(c.id)}
              />
            ))
          )}
        </div>
      </Sheet>
    </div>
  )
}
