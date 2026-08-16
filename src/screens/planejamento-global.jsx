/* ============================================================
   PLANEJAMENTO GLOBAL

   O cronograma mestre do projeto inteiro, que o setor de
   planejamento do Julio manda em planilha. É um espelho, não uma
   fonte: só o Mensal muda o Mensal (pelo import de PDF dele) e só
   o Semanal/diário mudam a data real de uma etapa. O Global nunca
   cria nem edita nada em Mensal — cada linha da planilha só tenta
   achar (por nome) uma etapa que já exista lá pra linkar; se a
   etapa ainda não existe em Mensal, a linha fica "sem etapa" até
   o nome bater num reimporte futuro.

   Cada linha da planilha tem um ID externo (do sistema deles) que
   vira a chave de reimportação: quando o setor manda uma versão
   atualizada, a mesma linha é reconhecida pelo ID e só tem a data
   prevista atualizada, em vez de duplicar. A data REAL mostrada
   aqui não vem da planilha — vem da etapa vinculada em Mensal
   (que por sua vez vem do que o Semanal/diário apontou), porque é
   o Mensal que manda nessa informação, não o Global.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { formatarDataCurta, plural } from '../lib/dominio'
import { Icon, Chip, PageHeader, Sheet, Vazio } from '../components'

export default function PlanejamentoGlobal({ perfil }) {
  const dados = useDados()
  const podeEditar = perfil.role !== 'campo'

  const [busca, setBusca] = useState('')
  const [soCritico, setSoCritico] = useState(false)
  const [importando, setImportando] = useState(false)

  const etapaPorId = useMemo(
    () => new Map(dados.cronograma.map((e) => [e.id, e])),
    [dados.cronograma],
  )

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return [...dados.cronogramaGlobal]
      .filter((i) => !soCritico || i.caminho_critico)
      .filter((i) => !b || i.descricao.toLowerCase().includes(b) || (i.lote || '').toLowerCase().includes(b))
      .sort((x, y) => (x.data_inicio < y.data_inicio ? -1 : 1))
  }, [dados.cronogramaGlobal, busca, soCritico])

  const criticos = dados.cronogramaGlobal.filter((i) => i.caminho_critico).length
  const semVinculo = dados.cronogramaGlobal.filter((i) => !i.schedule_item_id || !etapaPorId.has(i.schedule_item_id)).length

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Planejamento global"
        sub={`${plural(dados.cronogramaGlobal.length, 'tarefa', 'tarefas')} do cronograma mestre${criticos ? ` · ${criticos} no caminho crítico` : ''}`}
        acao={
          podeEditar && (
            <button className="btn btn-primary" onClick={() => setImportando(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar planilha
            </button>
          )
        }
      />

      {dados.cronogramaGlobal.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhum cronograma global importado"
            texto={
              podeEditar
                ? 'Importe a planilha mestre que o setor de planejamento manda — cada tarefa vira uma etapa em Mensal automaticamente.'
                : 'A gestão ainda não importou o cronograma mestre desta obra.'
            }
            acao={podeEditar && (
              <button className="btn btn-primary" onClick={() => setImportando(true)}>Importar planilha</button>
            )}
          />
        </div>
      ) : (
        <>
          <div className="alert info">
            Cada tarefa daqui tenta linkar (pelo nome) numa etapa que já exista em Planejamento mensal — o
            Global nunca cria nem muda nada lá. Reimporte a mesma planilha sempre que o setor de
            planejamento mandar uma versão nova — a data prevista é atualizada pelo ID da tarefa, sem
            duplicar nada; a data real mostrada aqui vem do que já está em Mensal.
          </div>

          {semVinculo > 0 && podeEditar && (
            <div className="alert danger">
              {plural(semVinculo, 'tarefa ainda não tem', 'tarefas ainda não têm')} uma etapa com esse nome
              cadastrada em Mensal — cadastre lá (com o mesmo nome) que a vinculação acontece sozinha no
              próximo reimporte.
            </div>
          )}

          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            <input
              className="ipt grow" style={{ minWidth: 200 }} value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por tarefa ou lote…"
            />
            <button
              className={`btn btn-sm ${soCritico ? 'btn-dark' : 'btn-secondary'}`}
              onClick={() => setSoCritico((v) => !v)}
              aria-pressed={soCritico}
            >
              Só caminho crítico
            </button>
          </div>

          {lista.length === 0 ? (
            <div className="card-flat"><Vazio titulo="Nada com esse filtro" texto="Troque a busca ou tire o filtro de caminho crítico." /></div>
          ) : (
            <div className="card-flat" style={{ overflowX: 'auto', padding: 0 }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Tarefa</th><th>Lote</th>
                    <th>Início prev.</th><th>Fim prev.</th>
                    <th>Início real</th><th>Fim real</th>
                    <th>Etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const etapa = i.schedule_item_id ? etapaPorId.get(i.schedule_item_id) : null
                    return (
                      <tr key={i.id} style={i.caminho_critico ? { background: 'var(--danger-tint)' } : undefined}>
                        <td>{i.descricao}</td>
                        <td>{i.lote || '—'}</td>
                        <td>{formatarDataCurta(i.data_inicio)}</td>
                        <td>{formatarDataCurta(i.data_fim)}</td>
                        <td>{etapa?.inicio_real ? formatarDataCurta(etapa.inicio_real) : '—'}</td>
                        <td>{etapa?.fim_real ? formatarDataCurta(etapa.fim_real) : '—'}</td>
                        <td>
                          {etapa
                            ? <Chip tom="success">Vinculada</Chip>
                            : <Chip tom="danger">Sem etapa</Chip>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ImportarCronogramaGlobal aberto={importando} onFechar={() => setImportando(false)} dados={dados} />
    </div>
  )
}

/* ── Importação da planilha mestre ────────────────────────── */

function ImportarCronogramaGlobal({ aberto, onFechar, dados }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const codigosExistentes = new Set(dados.cronogramaGlobal.map((i) => i.codigo_externo))

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerCronogramaGlobal } = await import('../lib/planilhaCronogramaGlobal')
      const lido = await lerCronogramaGlobal(arquivo)
      const itens = lido.itens.map((i) => ({ ...i, acao: codigosExistentes.has(i.codigo_externo) ? 'atualiza' : 'novo' }))
      setResultado({ ...lido, itens })
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const novos = (resultado?.itens || []).filter((i) => i.acao === 'novo').length
  const atualizados = (resultado?.itens || []).filter((i) => i.acao === 'atualiza').length

  const confirmar = async () => {
    if (!resultado?.itens?.length) return
    setImportandoAgora(true)
    try {
      const r = await dados.importarCronogramaGlobal(resultado.itens)
      if (!r) return
      setFeito(r)
    } finally {
      setImportandoAgora(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo="Importar cronograma global" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criados, 'tarefa nova criada', 'tarefas novas criadas')} e{' '}
              {plural(feito.atualizados, 'tarefa atualizada', 'tarefas atualizadas')}. Quem já tinha uma
              etapa com o mesmo nome em Planejamento mensal ficou vinculada automaticamente; o Mensal em
              si não foi alterado.
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              A planilha do cronograma mestre (.xlsx), do jeito que o setor de planejamento manda. Tarefa
              que já existe (mesmo ID) tem as datas atualizadas; tarefa nova entra do zero e já cria a
              etapa correspondente em Mensal.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo a planilha…' : nomeArquivo || 'Escolher arquivo .xlsx'}
              <input
                type="file" accept=".xlsx,.xls" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  {plural(novos, 'tarefa nova', 'tarefas novas')} · {plural(atualizados, 'atualização', 'atualizações')}
                  {resultado.semData > 0 ? ` · ${plural(resultado.semData, 'linha sem data válida', 'linhas sem data válida')} (não entram)` : ''}.
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.slice(0, 100).map((i) => (
                    <div
                      key={i.codigo_externo}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8, border: '1px solid var(--border)',
                        background: i.acao === 'atualiza' ? 'var(--info-tint)' : 'var(--success-tint)',
                      }}
                    >
                      <div className="row-between" style={{ gap: 8 }}>
                        <strong>{i.descricao}</strong>
                        <span
                          style={{
                            flex: 'none', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                            background: i.acao === 'atualiza' ? 'var(--info-tint)' : 'var(--success-tint)',
                            color: i.acao === 'atualiza' ? 'var(--info)' : 'var(--success)',
                          }}
                        >
                          {i.acao === 'atualiza' ? 'ATUALIZA' : 'NOVA'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {i.lote ? `${i.lote} · ` : ''}{formatarDataCurta(i.data_inicio)} a {formatarDataCurta(i.data_fim)}
                        {i.caminho_critico ? ' · crítico' : ''}
                      </div>
                    </div>
                  ))}
                  {resultado.itens.length > 100 && (
                    <div className="t-caption">+ {resultado.itens.length - 100} outras tarefas…</div>
                  )}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!resultado.itens.length || importandoAgora}
                  >
                    {importandoAgora
                      ? 'Importando…'
                      : `Importar ${plural(resultado.itens.length, 'tarefa', 'tarefas')}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
