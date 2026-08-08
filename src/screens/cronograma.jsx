/* ============================================================
   CRONOGRAMA FÍSICO

   O terceiro estado da mesma atividade (BRIEFING, seção 4): depois
   de planejada e executada, ela vira avanço no cronograma. Mas aqui
   o item é maior que uma frente de serviço de um dia — é uma etapa
   da EAP que dura semanas, então o percentual não sai do diário
   sozinho (ver o comentário grande em lib/dominio.js). Quem edita é
   a gestão; o campo só enxerga, do mesmo jeito que no planejamento.

   A importação existe porque a engenharia já mantém essa lista em
   planilha ou MS Project — redigitar dezenas de etapas seria
   trabalho à toa e uma fonte nova de erro de digitação.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, plural,
  situacaoCronograma, progressoEsperado, curvaFisica, ordenarCronograma,
  paraISOdeTextoBR, paraNumeroBR,
} from '../lib/dominio'
import { parseCSV } from '../lib/csv'
import {
  Icon, Chip, PageHeader, Sheet, Campo, Confirmar, Vazio, Indicador, Segmentos,
  BotaoRelatorio, RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

export default function Cronograma({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeEditar = perfil.role !== 'campo'

  const [editando, setEditando] = useState(null)
  const [medindo, setMedindo] = useState(null)
  const [removendo, setRemovendo] = useState(null)
  const [importando, setImportando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const itens = useMemo(() => ordenarCronograma(dados.cronograma), [dados.cronograma])
  const curva = useMemo(() => curvaFisica(itens, hoje), [itens, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNovo = () => setEditando({ descricao: '', data_inicio: hoje, data_fim: hoje, peso: '1' })
  const abrirEdicao = (item) => setEditando({ ...item, peso: String(item.peso) })

  const salvar = async () => {
    if (!editando?.descricao?.trim() || !editando?.data_inicio || !editando?.data_fim) return
    if (editando.data_fim < editando.data_inicio) return
    setSalvando(true)
    const ok = await dados.salvarItemCronograma({
      ...(editando.id ? { id: editando.id } : {}),
      descricao: editando.descricao,
      data_inicio: editando.data_inicio,
      data_fim: editando.data_fim,
      peso: editando.peso,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const salvarMedicao = async () => {
    if (!medindo) return
    setSalvando(true)
    const ok = await dados.medirCronograma(medindo.id, medindo.percentual)
    setSalvando(false)
    if (ok) setMedindo(null)
  }

  const faltaItens = itens.length === 0

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Cronograma</div>
          <div className="sub">Avanço físico da obra</div>
        </div>
        {podeEditar && (
          <button onClick={abrirNovo} aria-label="Nova etapa">
            <Icon name="mais_sinal" size={22} />
          </button>
        )}
      </div>

      <div className="page stack-2">
        <PageHeader
          titulo="Cronograma físico"
          sub={plural(itens.length, 'etapa cadastrada', 'etapas cadastradas')}
          acao={
            <div className="row-flex">
              {!faltaItens && <BotaoRelatorio />}
              {podeEditar && (
                <>
                  <button className="btn btn-secondary" onClick={() => setImportando(true)}>
                    <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar
                  </button>
                  <button className="btn btn-primary" onClick={abrirNovo}>
                    <Icon name="mais_sinal" size={18} /> Nova etapa
                  </button>
                </>
              )}
            </div>
          }
        />

        {!podeEditar && (
          <div className="alert info">
            Você está vendo o cronograma da obra. Quem cadastra as etapas e mede o avanço é a
            gestão.
          </div>
        )}

        {!faltaItens && <ResumoCurva curva={curva} />}

        {faltaItens ? (
          <div className="card-flat">
            <Vazio
              titulo="Nenhuma etapa cadastrada"
              texto={
                podeEditar
                  ? 'Importe a planilha do cronograma ou cadastre as etapas uma a uma.'
                  : 'A gestão ainda não cadastrou o cronograma desta obra.'
              }
              acao={podeEditar && (
                <div className="row-flex" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={() => setImportando(true)}>Importar</button>
                  <button className="btn btn-primary" onClick={abrirNovo}>Nova etapa</button>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="stack-1">
            {itens.map((item) => (
              <ItemCronograma
                key={item.id} item={item} hoje={hoje} podeEditar={podeEditar}
                onEditar={() => abrirEdicao(item)}
                onMedir={() => setMedindo({ id: item.id, percentual: String(item.percentual) })}
                onRemover={() => setRemovendo(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Nova etapa / editar ── */}
      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar etapa' : 'Nova etapa'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={
                salvando || !editando?.descricao?.trim() || !editando?.data_inicio
                || !editando?.data_fim || editando.data_fim < editando.data_inicio
              }
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Descrição da etapa">
            <input
              className="ipt" value={editando?.descricao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Ex.: Alvenaria · 5º pavimento"
            />
          </Campo>
          <div className="row-flex">
            <Campo label="Início previsto">
              <input
                className="ipt" type="date" value={editando?.data_inicio || ''}
                onChange={(e) => setEditando((p) => ({ ...p, data_inicio: e.target.value }))}
              />
            </Campo>
            <Campo label="Fim previsto">
              <input
                className="ipt" type="date" value={editando?.data_fim || ''}
                onChange={(e) => setEditando((p) => ({ ...p, data_fim: e.target.value }))}
              />
            </Campo>
          </div>
          {editando?.data_fim && editando?.data_inicio && editando.data_fim < editando.data_inicio && (
            <div className="alert danger">O fim não pode vir antes do início.</div>
          )}
          <Campo label="Peso" dica="O quanto esta etapa pesa em relação às outras, para o cálculo do avanço geral. Pode deixar 1 se todas pesarem igual.">
            <input
              className="ipt" type="number" inputMode="decimal" step="0.1" min="0.1"
              value={editando?.peso ?? ''}
              onChange={(e) => setEditando((p) => ({ ...p, peso: e.target.value }))}
            />
          </Campo>
        </div>
      </Sheet>

      {/* ── Medição ── */}
      <Sheet
        aberto={Boolean(medindo)}
        titulo="Medir avanço"
        onFechar={() => setMedindo(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setMedindo(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={salvarMedicao} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Registrar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <div className="t-caption">
            {itens.find((i) => i.id === medindo?.id)?.descricao}
          </div>
          <Campo label="Percentual executado">
            <input
              className="ipt" type="number" inputMode="decimal" step="1" min="0" max="100"
              value={medindo?.percentual ?? ''}
              onChange={(e) => setMedindo((m) => ({ ...m, percentual: e.target.value }))}
            />
          </Campo>
        </div>
      </Sheet>

      <Confirmar
        aberto={Boolean(removendo)}
        titulo="Remover etapa?"
        texto={removendo ? `«${removendo.descricao}» sai do cronograma. A medição registrada se perde junto.` : ''}
        rotuloOk="Remover" perigo
        onOk={async () => { await dados.removerItemCronograma(removendo.id); setRemovendo(null) }}
        onCancelar={() => setRemovendo(null)}
      />

      <ImportarCronograma aberto={importando} onFechar={() => setImportando(false)} />

      <RelatorioFolha
        titulo="Cronograma físico" sub={plural(itens.length, 'etapa', 'etapas')}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        <SecaoRelatorio titulo="Avanço físico da obra">
          <div style={{ fontSize: 13 }}>
            Executado: <strong>{curva.percentualReal}%</strong> · Previsto para hoje:{' '}
            <strong>{curva.percentualPrevisto}%</strong> · Etapas atrasadas: {curva.atrasados} de {curva.total}
          </div>
        </SecaoRelatorio>
        <SecaoRelatorio titulo="Etapas">
          <TabelaRelatorio
            colunas={['Etapa', 'Início', 'Fim', 'Peso', 'Executado', 'Previsto', 'Situação']}
            linhas={itens.map((item) => {
              const s = situacaoCronograma(item, hoje)
              return [
                item.descricao, formatarData(item.data_inicio), formatarData(item.data_fim),
                item.peso, `${Number(item.percentual || 0)}%`, `${progressoEsperado(item, hoje)}%`, s.rotulo,
              ]
            })}
          />
        </SecaoRelatorio>
      </RelatorioFolha>
    </>
  )
}

/* ── Resumo: curva física ─────────────────────────────────── */

function ResumoCurva({ curva }) {
  return (
    <div className="card stack-2">
      <div className="row-between">
        <div className="t-micro">Avanço físico da obra</div>
        <span
          className="t-num t-strong" style={{ fontSize: 20,
            color: curva.percentualReal >= curva.percentualPrevisto ? 'var(--success)' : 'var(--danger)' }}
        >
          {curva.percentualReal}%
        </span>
      </div>

      <BarraDupla real={curva.percentualReal} previsto={curva.percentualPrevisto} />

      <div className="t-caption">
        Previsto para hoje: {curva.percentualPrevisto}%. A marca escura na barra é onde a obra
        deveria estar; o preenchimento é onde ela está, pela última medição de cada etapa.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        <Indicador rotulo="Etapas" valor={curva.total} />
        <Indicador rotulo="Atrasadas" valor={curva.atrasados} tom={curva.atrasados ? 'danger' : undefined} />
      </div>
    </div>
  )
}

function BarraDupla({ real, previsto }) {
  const tom = real >= previsto ? 'var(--success)' : 'var(--danger)'
  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--surface-2)' }}>
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${Math.min(100, Math.max(0, real))}%`,
          background: tom, borderRadius: 999,
        }}
      />
      <div
        style={{
          position: 'absolute', top: -3, bottom: -3,
          left: `${Math.min(100, Math.max(0, previsto))}%`,
          width: 2, background: 'var(--text)', borderRadius: 1,
        }}
      />
    </div>
  )
}

/* ── Um item da lista ─────────────────────────────────────── */

function ItemCronograma({ item, hoje, podeEditar, onEditar, onMedir, onRemover }) {
  const situacao = situacaoCronograma(item, hoje)
  const esperado = progressoEsperado(item, hoje)
  const real = Number(item.percentual || 0)

  return (
    <div className="card-flat" style={{ borderLeft: `3px solid var(--${
      situacao.tom === 'danger' ? 'danger' : situacao.tom === 'success' ? 'success' : situacao.tom === 'info' ? 'info' : 'border-strong'
    })` }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="t-strong">{item.descricao}</div>
          <div className="t-caption">
            {formatarData(item.data_inicio)} a {formatarData(item.data_fim)} · peso {item.peso}
            {item.responsavel ? ` · ${item.responsavel}` : ''}
          </div>
        </div>
        <Chip tom={situacao.tom}>{situacao.rotulo}</Chip>
      </div>

      <div style={{ margin: '10px 0 4px' }}>
        <BarraDupla real={real} previsto={esperado} />
      </div>
      <div className="row-between">
        <span className="t-caption">Executado: {real}%</span>
        <span className="t-caption">Previsto: {esperado}%</span>
      </div>

      {podeEditar && (
        <div className="row-flex" style={{ marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={onMedir}>Medir</button>
          <button className="btn btn-ghost btn-sm" onClick={onEditar} aria-label="Editar">
            <Icon name="editar" size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onRemover} aria-label="Remover">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Importação de CSV ───────────────────────────────────────
   Aceita colar o texto direto da planilha ou escolher um arquivo
   .csv. Sempre mostra a pré-visualização antes de gravar qualquer
   coisa — importar 40 linhas erradas em silêncio seria pior do que
   não importar nada. */

const ALIASES = {
  descricao: ['descricao', 'descrição', 'etapa', 'atividade', 'servico', 'serviço', 'item', 'nome'],
  inicio: ['inicio', 'início', 'data inicio', 'data início', 'inicio previsto', 'início previsto', 'data de inicio'],
  fim: ['fim', 'termino', 'término', 'data fim', 'data termino', 'data término', 'fim previsto', 'data de termino'],
  peso: ['peso', 'peso %', '% do total', 'percentual do total'],
}

function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function mapearColunas(cabecalho) {
  const normalizado = cabecalho.map(normalizarTexto)
  const achar = (lista) => {
    for (const alvo of lista) {
      const i = normalizado.findIndex((c) => c === alvo)
      if (i >= 0) return i
    }
    return -1
  }
  return {
    descricao: achar(ALIASES.descricao),
    inicio: achar(ALIASES.inicio),
    fim: achar(ALIASES.fim),
    peso: achar(ALIASES.peso),
  }
}

function processarCSV(texto) {
  const linhas = parseCSV(texto)
  if (linhas.length < 2) {
    return { itens: [], erroGeral: 'Não encontrei linhas de dados. Cole o cabeçalho e pelo menos uma etapa.' }
  }
  const colunas = mapearColunas(linhas[0])
  if (colunas.descricao < 0 || colunas.inicio < 0 || colunas.fim < 0) {
    return {
      itens: [],
      erroGeral: 'Não reconheci as colunas. Preciso de pelo menos: descrição, início e fim. Baixe o modelo abaixo e preencha nele.',
    }
  }
  const itens = linhas.slice(1).map((linha, i) => {
    const descricao = (linha[colunas.descricao] || '').trim()
    const data_inicio = paraISOdeTextoBR(linha[colunas.inicio])
    const data_fim = paraISOdeTextoBR(linha[colunas.fim])
    const pesoTexto = colunas.peso >= 0 ? linha[colunas.peso] : ''
    const pesoLido = paraNumeroBR(pesoTexto)
    const peso = pesoLido && pesoLido > 0 ? pesoLido : 1

    const problemas = []
    if (!descricao) problemas.push('sem descrição')
    if (!data_inicio) problemas.push('data de início inválida')
    if (!data_fim) problemas.push('data de fim inválida')
    if (data_inicio && data_fim && data_fim < data_inicio) problemas.push('fim antes do início')

    return { linha: i + 2, descricao, data_inicio, data_fim, peso, problemas, valido: problemas.length === 0 }
  })
  return { itens, erroGeral: null }
}

function baixarModelo() {
  const linhas = [
    ['Descrição', 'Início', 'Fim', 'Peso'],
    ['Fundação', '01/03/2026', '30/03/2026', '10'],
    ['Alvenaria · 5º pavimento', '01/04/2026', '20/04/2026', '5'],
  ]
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modelo-cronograma.csv'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function ImportarCronograma({ aberto, onFechar }) {
  const dados = useDados()
  const [modo, setModo] = useState('pdf')   // 'pdf' | 'csv'
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState(null)
  const [lendoPDF, setLendoPDF] = useState(false)
  const [importando, setImportando] = useState(false)
  const [nomeArquivo, setNomeArquivo] = useState('')

  const fechar = () => {
    setTexto(''); setResultado(null); setNomeArquivo(''); setModo('pdf'); onFechar()
  }

  const processarTexto = () => setResultado(processarCSV(texto))

  const onArquivoCSV = (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => {
      const conteudo = String(leitor.result || '')
      setTexto(conteudo)
      setResultado(processarCSV(conteudo))
    }
    leitor.readAsText(arquivo, 'utf-8')
    e.target.value = ''
  }

  /* O PDF é comparado com o cronograma que JÁ está na tela: a
     mesma descrição vira atualização (data e responsável mudam,
     percentual medido fica intacto); descrição nova vira etapa
     nova. É só para a pessoa VER essa diferença antes de mandar —
     quem grava de fato é a função do banco, que faz a mesma conta. */
  const onArquivoPDF = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendoPDF(true)
    setResultado(null)
    try {
      /* Carregada só aqui, no clique — não no carregamento do app.
         O leitor de PDF pesa mais de 1 MB (a biblioteca da Mozilla
         inteira); ninguém que só quer ver o cronograma no celular,
         no sinal ruim do canteiro, deveria baixar esse peso à toa. */
      const { lerCronogramaDoPDF } = await import('../lib/pdfCronograma')
      const lido = await lerCronogramaDoPDF(arquivo)
      const existentes = new Set(dados.cronograma.map((i) => i.descricao.trim().toLowerCase()))
      const itens = lido.itens.map((i) => ({
        ...i,
        acao: existentes.has(i.descricao.trim().toLowerCase()) ? 'atualiza' : 'novo',
      }))
      setResultado({ itens, erroGeral: lido.erroGeral })
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendoPDF(false)
    }
  }

  const validos = (resultado?.itens || []).filter((i) => i.valido)
  const novos = validos.filter((i) => i.acao !== 'atualiza').length
  const atualizados = validos.filter((i) => i.acao === 'atualiza').length

  const confirmar = async () => {
    if (!validos.length) return
    setImportando(true)
    const ok = modo === 'pdf'
      ? await dados.importarCronogramaPDF(validos)
      : await dados.importarCronograma(validos)
    setImportando(false)
    if (ok) fechar()
  }

  return (
    <Sheet aberto={aberto} titulo="Importar cronograma" onFechar={fechar}>
      <div className="stack-2">
        <Segmentos
          valor={modo}
          onChange={(m) => { setModo(m); setResultado(null); setTexto(''); setNomeArquivo('') }}
          opcoes={[
            { valor: 'pdf', rotulo: 'PDF operacional' },
            { valor: 'csv', rotulo: 'Planilha (CSV)' },
          ]}
        />

        {modo === 'pdf' ? (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O relatório mensal em PDF, do mesmo jeito que o setor de planejamento manda. Etapa que
              já existe (mesma descrição) tem a data e o responsável atualizados — o percentual já
              medido não muda. Etapa nova entra do zero.
            </div>
            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendoPDF ? 'Lendo o PDF…' : nomeArquivo || 'Escolher arquivo .pdf'}
              <input
                type="file" accept=".pdf,application/pdf" onChange={onArquivoPDF}
                style={{ display: 'none' }} disabled={lendoPDF}
              />
            </label>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Cole as linhas da planilha (cabeçalho: Descrição, Início, Fim e Peso) ou escolha o
              arquivo .csv exportado do Excel ou do MS Project.
            </div>
            <div className="row-flex">
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                Escolher arquivo .csv
                <input type="file" accept=".csv,text/csv" onChange={onArquivoCSV} style={{ display: 'none' }} />
              </label>
              <button className="btn btn-ghost btn-sm" onClick={baixarModelo}>Baixar modelo</button>
            </div>
            <textarea
              className="ipt" rows={6}
              style={{ height: 'auto', padding: 10, fontFamily: 'monospace', fontSize: 12 }}
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
              placeholder={'Descrição;Início;Fim;Peso\nFundação;01/03/2026;30/03/2026;10'}
            />
            {!resultado && (
              <button className="btn btn-primary" onClick={processarTexto} disabled={!texto.trim()}>
                Conferir
              </button>
            )}
          </>
        )}

        {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

        {resultado && !resultado.erroGeral && (
          <>
            <div className="alert info">
              {modo === 'pdf'
                ? [
                    novos ? plural(novos, 'etapa nova', 'etapas novas') : null,
                    atualizados ? `${plural(atualizados, 'atualização', 'atualizações')} de data/responsável` : null,
                  ].filter(Boolean).join(' · ') || 'Nada pronto para importar.'
                : `${plural(validos.length, 'etapa pronta', 'etapas prontas')} para importar`}
              {resultado.itens.length > validos.length
                ? ` · ${plural(resultado.itens.length - validos.length, 'linha com problema', 'linhas com problema')} (não entram)`
                : ''}.
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto' }} className="stack-1">
              {resultado.itens.map((i) => (
                <div
                  key={i.linha}
                  style={{
                    fontSize: 12, padding: 8, borderRadius: 8,
                    border: `1px solid ${i.valido ? 'var(--border)' : 'var(--danger)'}`,
                    background: i.valido ? 'var(--surface)' : 'var(--danger-tint)',
                  }}
                >
                  <div className="row-between" style={{ gap: 8 }}>
                    <strong>{i.descricao || '(sem descrição)'}</strong>
                    {i.valido && modo === 'pdf' && (
                      <span
                        style={{
                          flex: 'none', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                          background: i.acao === 'atualiza' ? 'var(--info-tint)' : 'var(--success-tint)',
                          color: i.acao === 'atualiza' ? 'var(--info)' : 'var(--success)',
                        }}
                      >
                        {i.acao === 'atualiza' ? 'ATUALIZA' : 'NOVA'}
                      </span>
                    )}
                  </div>
                  {i.valido
                    ? (
                      <div style={{ marginTop: 2 }}>
                        {formatarData(i.data_inicio)} a {formatarData(i.data_fim)}
                        {i.responsavel ? ` · ${i.responsavel}` : ''}
                        {i.peso ? ` · peso ${i.peso}` : ''}
                      </div>
                    )
                    : <div style={{ marginTop: 2 }}>— {i.problemas.join(', ')}</div>}
                </div>
              ))}
            </div>

            <div className="row-flex">
              <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
              <button
                className="btn btn-primary grow" onClick={confirmar}
                disabled={!validos.length || importando}
              >
                {importando ? 'Importando…' : `Importar ${plural(validos.length, 'etapa', 'etapas')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
