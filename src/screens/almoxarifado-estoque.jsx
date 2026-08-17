/* ============================================================
   ALMOXARIFADO — CONTROLE DE ESTOQUE

   Modelado em cima da planilha que o almoxarife já usa (Entrada /
   Saída / Estoque, uma aba cada): aqui viram três sub-abas do mesmo
   jeito. O saldo nunca é digitado — é sempre entrada menos saída,
   calculado na hora (dominio.saldoEstoque), do mesmo jeito que o
   SUMIF da planilha fazia.

   Cadastrar um material novo não é um passo à parte: acontece na
   hora de lançar a primeira entrada dele, direto no formulário —
   "fácil de adicionar material" era o pedido.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, formatarData, formatarDataCurta, plural, saldoEstoque } from '../lib/dominio'
import { linkQrMaterial, gerarQRDataURL, abrirJanelaEtiquetas, escreverEtiquetas } from '../lib/qrEstoque'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista,
} from '../components'

/* Baixa CSV no mesmo layout de colunas da planilha do almoxarife
   (abas Estoque/Entrada/Saida) — pra continuar abrindo no Excel dele
   sem precisar remontar nada na mão. Ponto e vírgula e BOM: é o que
   faz o Excel em português abrir com colunas separadas e acentos
   certos (mesmo truque do CSV do Planejamento). */
function baixarCSV(nomeArquivo, cabecalho, linhas) {
  const csv = [cabecalho, ...linhas]
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function AlmoxarifadoEstoque({ perfil, params = {} }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [aba, setAba] = useState('estoqueAtual')
  const [busca, setBusca] = useState('')
  const [novaEntrada, setNovaEntrada] = useState(null)
  const [novaSaida, setNovaSaida] = useState(null)
  const [editandoMaterial, setEditandoMaterial] = useState(null)
  const [importando, setImportando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [etiquetando, setEtiquetando] = useState(false)
  const [gerandoEtiquetas, setGerandoEtiquetas] = useState(false)

  const materiais = useMemo(
    () => (dados.materiaisEstoque || []).filter((m) => m.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.materiaisEstoque],
  )
  const saldos = useMemo(
    () => saldoEstoque(materiais, dados.entradasEstoque, dados.saidasEstoque),
    [materiais, dados.entradasEstoque, dados.saidasEstoque],
  )
  const saldosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = termo ? saldos.filter((s) => s.material.nome.toLowerCase().includes(termo)) : saldos
    return [...lista].sort((a, b) => (a.abaixoDoMinimo === b.abaixoDoMinimo ? 0 : a.abaixoDoMinimo ? -1 : 1))
  }, [saldos, busca])
  const abaixoDoMinimo = saldos.filter((s) => s.abaixoDoMinimo).length

  /* Estoque Atual e Histórico Estoque são a MESMA lista de saldos,
     só separada pelo saldo ser maior que zero ou não — material
     recém-cadastrado (importado da planilha, ou criado na hora)
     nasce com saldo zero, fica no Histórico até a primeira entrada;
     a partir daí o saldo recalcula sozinho (dominio.saldoEstoque) e
     ele passa a aparecer no Estoque Atual, sem precisar mover nada
     na mão. */
  const emEstoque = useMemo(() => saldosFiltrados.filter((s) => s.saldo > 0), [saldosFiltrados])
  const semEstoque = useMemo(() => saldosFiltrados.filter((s) => s.saldo <= 0), [saldosFiltrados])

  const entradas = useMemo(
    () => [...(dados.entradasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.entradasEstoque],
  )
  const saidas = useMemo(
    () => [...(dados.saidasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.saidasEstoque],
  )

  /* Histórico de movimentação de UM material (dentro de Editar
     material) — entrada e saída juntas, mais recente primeiro, pra
     ver de relance quando entrou e quando saiu, sem precisar caçar
     em duas abas separadas. */
  const historicoMaterial = useMemo(() => {
    if (!editandoMaterial?.id) return []
    const ents = entradas
      .filter((e) => e.material_id === editandoMaterial.id)
      .map((e) => ({ tipo: 'entrada', data: e.data, quantidade: e.quantidade, detalhe: e.recebido_por ? `recebido por ${e.recebido_por}` : e.fornecedor || '' }))
    const sais = saidas
      .filter((s) => s.material_id === editandoMaterial.id)
      .map((s) => ({ tipo: 'saida', data: s.data, quantidade: s.quantidade, detalhe: s.destino || '' }))
    return [...ents, ...sais].sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [editandoMaterial, entradas, saidas])

  const nomeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.nome || 'Material removido'
  const unidadeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.unidade || ''

  /* Mesmo ponto de partida pro botão "Nova entrada" do topo e pro
     "Lançar entrada" de dentro de Editar material — só muda se o
     material já vem escolhido (pulando o seletor, que com 752
     opções não é rápido de navegar de novo). */
  const abrirNovaEntrada = (materialId = '') => setNovaEntrada({
    data: hoje, material_id: materialId, quantidade: '',
    fornecedor: '', nota_fiscal: '', data_nota: '', valor_total: '', recebido_por: '',
  })

  const abrirNovaSaida = (materialId = '') => setNovaSaida({
    data: hoje, material_id: materialId, quantidade: '', destino: '',
  })

  /* Chegada por QR Code: a etiqueta da prateleira já traz a pessoa
     direto pra "Registrar saída" deste material, sem passar pela
     lista nem pelo seletor. */
  useEffect(() => {
    if (params.abrirEstoqueMaterialId) abrirNovaSaida(params.abrirEstoqueMaterialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.abrirEstoqueMaterialId])

  const salvarEntrada = async () => {
    if (!novaEntrada?.material_id || !novaEntrada?.data || !Number(novaEntrada?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarEntradaEstoque(novaEntrada)
    setSalvando(false)
    if (ok) setNovaEntrada(null)
  }

  const salvarSaida = async () => {
    if (!novaSaida?.material_id || !novaSaida?.data || !Number(novaSaida?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarSaidaEstoque(novaSaida)
    setSalvando(false)
    if (ok) setNovaSaida(null)
  }

  const salvarMaterial = async () => {
    if (!editandoMaterial?.nome?.trim() || !editandoMaterial?.unidade?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarCadastro('materiaisEstoque', {
      ...editandoMaterial,
      nome: editandoMaterial.nome.trim(),
      unidade: editandoMaterial.unidade.trim(),
      categoria: (editandoMaterial.categoria || '').trim() || null,
      estoque_minimo: editandoMaterial.estoque_minimo === '' ? null : Number(editandoMaterial.estoque_minimo),
    })
    setSalvando(false)
    if (ok) setEditandoMaterial(null)
  }

  /* Gera o QR de cada material selecionado (o link é sempre o mesmo
     formato: origem do app + ?qr=<id>, ver lib/qrEstoque) e abre a
     aba de impressão já pronta pra colar na prateleira.

     A janela abre ANTES de gerar os QR Codes (que é assíncrono) —
     precisa ser assim: o navegador só deixa `window.open` passar sem
     bloqueio quando ele roda no mesmo tique do clique, e "gerar 700
     QR Codes" não pode acontecer nesse mesmo tique. */
  const imprimirEtiquetas = async (lista) => {
    if (!lista.length || gerandoEtiquetas) return
    const janela = abrirJanelaEtiquetas()
    if (!janela) {
      dados.avisarErro('O navegador bloqueou a janela de impressão. Libere pop-ups pra este site e tente de novo.')
      return
    }
    setGerandoEtiquetas(true)
    try {
      const etiquetas = await Promise.all(lista.map(async (m) => ({
        nome: m.nome,
        dataUrl: await gerarQRDataURL(linkQrMaterial(m.id)),
      })))
      escreverEtiquetas(janela, etiquetas, dados.obra.nome)
    } finally {
      setGerandoEtiquetas(false)
    }
  }

  const pedirExcluirEntrada = (item) => setConfirmar({
    titulo: 'Excluir entrada?',
    texto: `«${nomeMaterial(item.material_id)}» (${item.quantidade} ${unidadeMaterial(item.material_id)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirEntradaEstoque(item.id) },
  })

  const pedirExcluirSaida = (item) => setConfirmar({
    titulo: 'Excluir saída?',
    texto: `«${nomeMaterial(item.material_id)}» (${item.quantidade} ${unidadeMaterial(item.material_id)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirSaidaEstoque(item.id) },
  })

  const baixarPlanilha = () => {
    const sigla = dados.obra.sigla || 'obra'
    if (aba === 'estoqueAtual' || aba === 'historico') {
      const lista = aba === 'estoqueAtual' ? emEstoque : semEstoque
      baixarCSV(
        `${aba === 'estoqueAtual' ? 'estoque' : 'historico-estoque'}-${sigla}-${hoje}.csv`,
        ['Material', 'Unidade', 'Quantidade', 'Custo Unitário Médio', 'Custo Total', 'Quantidade de Saída', 'Estoque', 'Estoque regulador'],
        lista.map((s) => [
          s.material.nome, s.material.unidade, s.quantidadeEntrada,
          s.custoMedio.toFixed(2), s.custoTotal.toFixed(2), s.quantidadeSaida, s.saldo,
          s.material.estoque_minimo ?? '',
        ]),
      )
    } else if (aba === 'entradas') {
      baixarCSV(
        `entrada-${sigla}-${hoje}.csv`,
        ['Chegou em', 'Material', 'Fornecedor', 'Nº da Nota Fiscal', 'Data da Nota', 'Quantidade', 'Recebido por'],
        entradas.map((e) => [
          formatarData(e.data), nomeMaterial(e.material_id), e.fornecedor || '',
          e.nota_fiscal || '', formatarData(e.data_nota), e.quantidade, e.recebido_por || '',
        ]),
      )
    } else {
      baixarCSV(
        `saida-${sigla}-${hoje}.csv`,
        ['Data', 'Material', 'Quantidade', 'DESTINO'],
        saidas.map((s) => [formatarData(s.data), nomeMaterial(s.material_id), s.quantidade, s.destino || '']),
      )
    }
  }

  const pedirArquivarMaterial = (material) => setConfirmar({
    titulo: 'Arquivar material?',
    texto: `«${material.nome}» deixa de aparecer pra escolher em entrada/saída novas. O histórico continua intacto.`,
    rotuloOk: 'Arquivar', perigo: true,
    onOk: async () => { setConfirmar(null); setEditandoMaterial(null); await dados.arquivarCadastro('materiaisEstoque', material.id) },
  })

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Controle de estoque"
        sub={`${plural(materiais.length, 'material', 'materiais')} cadastrado${materiais.length === 1 ? '' : 's'}${abaixoDoMinimo ? ` · ${abaixoDoMinimo} abaixo do mínimo` : ''}`}
        acao={
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setImportando(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar planilha
            </button>
            <button className="btn btn-secondary" onClick={() => setEtiquetando(true)}>
              <Icon name="qrcode" size={16} /> Etiquetas QR
            </button>
            <button className="btn btn-secondary" onClick={() => abrirNovaSaida()}>
              <Icon name="baixar" size={16} /> Registrar saída
            </button>
            <button className="btn btn-primary" onClick={() => abrirNovaEntrada()}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Nova entrada
            </button>
          </div>
        }
      />

      <Segmentos
        valor={aba} onChange={setAba}
        opcoes={[
          { valor: 'estoqueAtual', rotulo: 'Estoque Atual', contador: emEstoque.length },
          { valor: 'entradas', rotulo: 'Entradas', contador: entradas.length },
          { valor: 'saidas', rotulo: 'Saídas', contador: saidas.length },
          { valor: 'historico', rotulo: 'Histórico Estoque', contador: semEstoque.length },
        ]}
      />

      <div className="row-between">
        <div className="t-caption">
          {aba === 'estoqueAtual' && `${plural(emEstoque.length, 'material', 'materiais')} nesta lista`}
          {aba === 'entradas' && `${plural(entradas.length, 'entrada lançada', 'entradas lançadas')}`}
          {aba === 'saidas' && `${plural(saidas.length, 'saída lançada', 'saídas lançadas')}`}
          {aba === 'historico' && `${plural(semEstoque.length, 'material sem estoque', 'materiais sem estoque')}`}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={baixarPlanilha}>
          <Icon name="baixar" size={15} /> Baixar planilha
        </button>
      </div>

      {(aba === 'estoqueAtual' || aba === 'historico') && (() => {
        const lista = aba === 'estoqueAtual' ? emEstoque : semEstoque
        return (
          <div className="stack-2">
            {materiais.length > 0 && (
              <input
                className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar material…"
              />
            )}
            {lista.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo={materiais.length === 0 ? 'Nenhum material cadastrado' : 'Nada com esse nome'}
                  texto={
                    materiais.length === 0
                      ? 'Cadastre o primeiro material lançando uma entrada — não precisa de passo separado.'
                      : aba === 'estoqueAtual'
                        ? 'Nenhum material com saldo ainda — lance uma entrada, ou troque a busca.'
                        : 'Nenhum material sem estoque com esse nome — troque a busca ou limpe o campo.'
                  }
                  acao={materiais.length === 0 && (
                    <button className="btn btn-primary" onClick={() => abrirNovaEntrada()}>
                      Lançar entrada
                    </button>
                  )}
                />
              </div>
            ) : (
              <div className="stack-1">
                {lista.map((s) => (
                  <ItemLista
                    key={s.material.id}
                    titulo={s.material.nome}
                    sub={[s.material.categoria, s.material.estoque_minimo != null && s.material.estoque_minimo !== '' ? `mínimo ${s.material.estoque_minimo} ${s.material.unidade}` : null].filter(Boolean).join(' · ')}
                    direita={
                      <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                        {s.abaixoDoMinimo && <Chip tom="danger">Abaixo do mínimo</Chip>}
                        <span className="t-strong" style={{ fontSize: 15, minWidth: 70, textAlign: 'right' }}>
                          {s.saldo} {s.material.unidade}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditandoMaterial({ ...s.material, estoque_minimo: s.material.estoque_minimo ?? '' })}
                          aria-label="Editar material"
                        >
                          <Icon name="editar" size={16} />
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {aba === 'entradas' && (
        entradas.length === 0 ? (
          <div className="card-flat">
            <Vazio titulo="Nenhuma entrada lançada" texto="Toda vez que chegar material na obra, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (
          <div className="stack-1">
            {entradas.map((e) => (
              <ItemLista
                key={e.id}
                titulo={nomeMaterial(e.material_id)}
                sub={[formatarDataCurta(e.data), e.fornecedor, e.nota_fiscal ? `NF ${e.nota_fiscal}` : null, e.recebido_por ? `recebido por ${e.recebido_por}` : null].filter(Boolean).join(' · ')}
                direita={
                  <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                    <span className="t-strong" style={{ fontSize: 14 }}>+{e.quantidade} {unidadeMaterial(e.material_id)}</span>
                    {podeExcluir && (
                      <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluirEntrada(e)} aria-label="Excluir">
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )
      )}

      {aba === 'saidas' && (
        saidas.length === 0 ? (
          <div className="card-flat">
            <Vazio titulo="Nenhuma saída lançada" texto="Toda vez que um material sair do almoxarifado, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (
          <div className="stack-1">
            {saidas.map((s) => (
              <ItemLista
                key={s.id}
                titulo={nomeMaterial(s.material_id)}
                sub={[formatarDataCurta(s.data), s.destino].filter(Boolean).join(' · ')}
                direita={
                  <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                    <span className="t-strong" style={{ fontSize: 14 }}>−{s.quantidade} {unidadeMaterial(s.material_id)}</span>
                    {podeExcluir && (
                      <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluirSaida(s)} aria-label="Excluir">
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )
      )}

      {/* ── Nova entrada ── */}
      <Sheet
        aberto={Boolean(novaEntrada)}
        titulo="Nova entrada"
        onFechar={() => setNovaEntrada(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNovaEntrada(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarEntrada}
              disabled={salvando || !novaEntrada?.material_id || !novaEntrada?.data || !Number(novaEntrada?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {novaEntrada && (
          <div className="stack-2">
            <SelecaoMaterial
              materialId={novaEntrada.material_id}
              materiais={materiais}
              dados={dados}
              onEscolher={(id) => setNovaEntrada((p) => ({ ...p, material_id: id }))}
            />
            <div className="row-flex">
              <Campo label="Quantidade">
                <input
                  className="ipt" type="number" inputMode="decimal" min="0" step="any"
                  value={novaEntrada.quantidade}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Chegou em">
                <input
                  className="ipt" type="date" value={novaEntrada.data}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <div className="row-flex">
              <Campo label="Fornecedor" dica="Opcional">
                <input
                  className="ipt" value={novaEntrada.fornecedor}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, fornecedor: e.target.value }))}
                />
              </Campo>
              <Campo label="Recebido por" dica="Opcional — quem conferiu na obra">
                <input
                  className="ipt" value={novaEntrada.recebido_por}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, recebido_por: e.target.value }))}
                />
              </Campo>
            </div>
            <div className="row-flex">
              <Campo label="Nº da nota fiscal" dica="Opcional">
                <input
                  className="ipt" value={novaEntrada.nota_fiscal}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, nota_fiscal: e.target.value }))}
                />
              </Campo>
              <Campo label="Data da nota" dica="Opcional">
                <input
                  className="ipt" type="date" value={novaEntrada.data_nota}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, data_nota: e.target.value }))}
                />
              </Campo>
            </div>
            <Campo label="Valor total" dica="Opcional — usado pra calcular o custo médio do material.">
              <input
                className="ipt" type="number" inputMode="decimal" min="0" step="any"
                value={novaEntrada.valor_total}
                onChange={(e) => setNovaEntrada((p) => ({ ...p, valor_total: e.target.value }))}
                placeholder="R$"
              />
            </Campo>
          </div>
        )}
      </Sheet>

      {/* ── Nova saída ── */}
      <Sheet
        aberto={Boolean(novaSaida)}
        titulo="Registrar saída"
        onFechar={() => setNovaSaida(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNovaSaida(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarSaida}
              disabled={salvando || !novaSaida?.material_id || !novaSaida?.data || !Number(novaSaida?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {novaSaida && (
          <div className="stack-2">
            <SelecaoMaterial
              materialId={novaSaida.material_id}
              materiais={materiais}
              dados={dados}
              onEscolher={(id) => setNovaSaida((p) => ({ ...p, material_id: id }))}
            />
            {novaSaida.material_id && (
              <div className="t-caption">
                Saldo atual: {saldos.find((s) => s.material.id === novaSaida.material_id)?.saldo ?? 0} {unidadeMaterial(novaSaida.material_id)}
              </div>
            )}
            <div className="row-flex">
              <Campo label="Quantidade">
                <input
                  className="ipt" type="number" inputMode="decimal" min="0" step="any"
                  value={novaSaida.quantidade}
                  onChange={(e) => setNovaSaida((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={novaSaida.data}
                  onChange={(e) => setNovaSaida((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <Campo label="Destino" dica="Pra onde foi — obra, empresa, pessoa.">
              <input
                className="ipt" value={novaSaida.destino}
                onChange={(e) => setNovaSaida((p) => ({ ...p, destino: e.target.value }))}
                placeholder="Bloco Vendas, Equipe própria…"
              />
            </Campo>
          </div>
        )}
      </Sheet>

      {/* ── Editar material ── */}
      <Sheet
        aberto={Boolean(editandoMaterial)}
        titulo="Editar material"
        onFechar={() => setEditandoMaterial(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditandoMaterial(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarMaterial}
              disabled={salvando || !editandoMaterial?.nome?.trim() || !editandoMaterial?.unidade?.trim()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editandoMaterial && (
          <div className="stack-2">
            <Campo label="Nome">
              <input
                className="ipt" value={editandoMaterial.nome}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, nome: e.target.value }))}
              />
            </Campo>
            <div className="row-flex">
              <Campo label="Unidade">
                <input
                  className="ipt" value={editandoMaterial.unidade}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, unidade: e.target.value }))}
                  placeholder="unid, kg, m, L…"
                />
              </Campo>
              <Campo label="Categoria" dica="Opcional">
                <input
                  className="ipt" value={editandoMaterial.categoria || ''}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, categoria: e.target.value }))}
                  placeholder="Elétrico, hidráulico, limpeza…"
                />
              </Campo>
            </div>
            <Campo label="Estoque mínimo" dica="Opcional — abaixo disso, o material aparece marcado na aba Saldo.">
              <input
                className="ipt" type="number" inputMode="decimal" min="0" step="any"
                value={editandoMaterial.estoque_minimo}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, estoque_minimo: e.target.value }))}
              />
            </Campo>
            <div className="row-flex">
              <button
                className="btn btn-secondary grow"
                onClick={() => { const id = editandoMaterial.id; setEditandoMaterial(null); abrirNovaEntrada(id) }}
              >
                <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Lançar entrada
              </button>
              <button
                className="btn btn-secondary grow"
                onClick={() => { const id = editandoMaterial.id; setEditandoMaterial(null); abrirNovaSaida(id) }}
              >
                <Icon name="baixar" size={16} /> Lançar saída
              </button>
            </div>

            <button
              className="btn btn-ghost btn-block"
              onClick={() => imprimirEtiquetas([editandoMaterial])}
              disabled={gerandoEtiquetas}
            >
              <Icon name="qrcode" size={16} /> {gerandoEtiquetas ? 'Gerando…' : 'Imprimir etiqueta QR deste material'}
            </button>

            <div>
              <div className="t-micro" style={{ marginBottom: 8 }}>Histórico de movimentação</div>
              {historicoMaterial.length === 0 ? (
                <div className="t-caption">Nenhuma entrada ou saída lançada ainda pra este material.</div>
              ) : (
                <div className="stack-1">
                  {historicoMaterial.map((h, i) => (
                    <div key={i} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                      <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
                        <Chip tom={h.tipo === 'entrada' ? 'success' : 'danger'}>
                          {h.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                        </Chip>
                        <div>
                          <div className="t-caption">{formatarDataCurta(h.data)}</div>
                          {h.detalhe && <div className="t-caption">{h.detalhe}</div>}
                        </div>
                      </div>
                      <span className="t-strong" style={{ fontSize: 14 }}>
                        {h.tipo === 'entrada' ? '+' : '−'}{h.quantidade} {editandoMaterial.unidade}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => pedirArquivarMaterial(editandoMaterial)}>
              Arquivar material
            </button>
          </div>
        )}
      </Sheet>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <ImportarMateriais
        aberto={importando}
        onFechar={() => setImportando(false)}
        dados={dados}
        materiaisExistentes={dados.materiaisEstoque || []}
      />

      <EtiquetasQR
        aberto={etiquetando}
        onFechar={() => setEtiquetando(false)}
        materiais={materiais}
        gerando={gerandoEtiquetas}
        onImprimir={imprimirEtiquetas}
      />
    </div>
  )
}

/* ── Importação do cadastro de materiais ─────────────────────
   Só o cadastro (nome, unidade, mínimo) — decisão do Julio: começar
   com o saldo zerado no app e lançar as entradas daqui pra frente,
   sem herdar quantidade nem histórico da planilha antiga. Material
   que já existe (mesmo nome) não duplica, só é avisado. */
function ImportarMateriais({ aberto, onFechar, dados, materiaisExistentes }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const nomesExistentes = new Set(
    materiaisExistentes.map((m) => m.nome.trim().toLowerCase()),
  )

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerPlanilhaEstoque } = await import('../lib/planilhaEstoque')
      const lido = await lerPlanilhaEstoque(arquivo)
      const itens = lido.itens.map((i) => ({
        ...i,
        jaExiste: nomesExistentes.has(i.nome.trim().toLowerCase()),
      }))
      setResultado({ ...lido, itens })
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const novos = (resultado?.itens || []).filter((i) => !i.jaExiste)

  const confirmar = async () => {
    if (!novos.length) return
    setImportandoAgora(true)
    let criados = 0
    for (const item of novos) {
      const ok = await dados.salvarCadastro('materiaisEstoque', {
        nome: item.nome, unidade: item.unidade, estoque_minimo: item.estoque_minimo,
      })
      if (ok) criados++
    }
    setImportandoAgora(false)
    setFeito({ criados, jaExistiam: (resultado?.itens.length || 0) - novos.length })
  }

  return (
    <Sheet aberto={aberto} titulo="Importar materiais da planilha" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criados, 'material cadastrado', 'materiais cadastrados')}.
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'material já existia', 'materiais já existiam')} e não foram duplicados.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Escolha a planilha de estoque (.xlsx ou .xlsm) — leio a aba "Estoque" e trago o nome, a
              unidade e o mínimo de cada material. Só o cadastro: quantidade e histórico ficam pra
              lançar pelo app a partir de agora.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo a planilha…' : nomeArquivo || 'Escolher arquivo .xlsx/.xlsm'}
              <input
                type="file" accept=".xlsx,.xlsm,.xls" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  {plural(novos.length, 'material novo', 'materiais novos')} para importar
                  {resultado.itens.length > novos.length
                    ? ` · ${plural(resultado.itens.length - novos.length, 'já cadastrado', 'já cadastrados')} (não duplica)`
                    : ''}.
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.map((i) => (
                    <div
                      key={i.linha}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${i.jaExiste ? 'var(--border)' : 'var(--success)'}`,
                        background: i.jaExiste ? 'var(--surface-2)' : 'var(--success-tint)',
                      }}
                    >
                      <div className="row-between">
                        <strong>{i.nome}</strong>
                        <span style={{ color: i.jaExiste ? 'var(--text-3)' : 'var(--success)', fontWeight: 600 }}>
                          {i.jaExiste ? 'já cadastrado' : 'novo'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {i.unidade}{i.estoque_minimo ? ` · mínimo ${i.estoque_minimo}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!novos.length || importandoAgora}
                  >
                    {importandoAgora ? 'Importando…' : `Importar ${plural(novos.length, 'material', 'materiais')}`}
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

/* ── Etiquetas QR — escolhe quais materiais imprimir ─────────
   Nasce com tudo marcado — imprimir o lote inteiro de uma vez é o
   uso mais comum (etiquetar a prateleira toda). Cada QR aponta pro
   link do próprio material (lib/qrEstoque); apontar a câmera do
   celular nele abre o Prumo direto na saída daquele material. */
function EtiquetasQR({ aberto, onFechar, materiais, gerando, onImprimir }) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())

  useEffect(() => {
    if (aberto) setSelecionados(new Set(materiais.map((m) => m.id)))
    else setBusca('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? materiais.filter((m) => m.nome.toLowerCase().includes(termo)) : materiais
  }, [materiais, busca])

  const alternar = (id) => setSelecionados((s) => {
    const novo = new Set(s)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    return novo
  })

  const todosFiltradosMarcados = filtrados.length > 0 && filtrados.every((m) => selecionados.has(m.id))
  const alternarTodos = () => setSelecionados((s) => {
    const novo = new Set(s)
    if (todosFiltradosMarcados) filtrados.forEach((m) => novo.delete(m.id))
    else filtrados.forEach((m) => novo.add(m.id))
    return novo
  })

  const confirmar = async () => {
    const lista = materiais.filter((m) => selecionados.has(m.id))
    await onImprimir(lista)
    onFechar()
  }

  return (
    <Sheet
      aberto={aberto}
      titulo="Etiquetas QR"
      onFechar={onFechar}
      rodape={
        <div className="row-flex">
          <button className="btn btn-secondary grow" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary grow" onClick={confirmar} disabled={gerando || selecionados.size === 0}>
            {gerando ? 'Gerando…' : `Imprimir ${plural(selecionados.size, 'etiqueta', 'etiquetas')}`}
          </button>
        </div>
      }
    >
      <div className="stack-2">
        <div className="t-caption" style={{ lineHeight: 1.5 }}>
          Cada etiqueta traz o QR Code e o nome do material embaixo. Cole na prateleira —
          apontando a câmera do celular nela, abre direto a saída daquele material.
        </div>

        {materiais.length === 0 ? (
          <div className="t-caption">Nenhum material cadastrado ainda.</div>
        ) : (
          <>
            <input
              className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar material…"
            />
            <button className="btn btn-ghost btn-sm" onClick={alternarTodos} style={{ alignSelf: 'flex-start' }}>
              {todosFiltradosMarcados ? 'Limpar seleção' : 'Selecionar todos'}
            </button>
            <div style={{ maxHeight: 360, overflowY: 'auto' }} className="stack-1">
              {filtrados.map((m) => (
                <label
                  key={m.id} className="card-flat row-flex"
                  style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={selecionados.has(m.id)} onChange={() => alternar(m.id)} />
                  <span className="grow">{m.nome}</span>
                </label>
              ))}
              {filtrados.length === 0 && <div className="t-caption">Nada com esse nome.</div>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ── Escolha de material, com criação rápida embutida ────────
   "Fácil de adicionar material" era o pedido: em vez de mandar
   cadastrar antes, em outro lugar, o campo de busca já deixa criar
   o material na hora, direto aqui — some do formulário de entrada,
   sobra pronto pra próxima saída. */
function SelecaoMaterial({ materialId, materiais, dados, onEscolher }) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState('unid')
  const [salvando, setSalvando] = useState(false)

  if (criando) {
    const criar = async () => {
      if (!nome.trim() || !unidade.trim()) return
      setSalvando(true)
      const criado = await dados.salvarCadastro('materiaisEstoque', { nome: nome.trim(), unidade: unidade.trim() })
      setSalvando(false)
      if (criado) {
        onEscolher(criado.id)
        setCriando(false)
        setNome('')
        setUnidade('unid')
      }
    }
    return (
      <Campo label="Material novo">
        <div className="stack-1">
          <input
            className="ipt" autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do material"
          />
          <div className="row-flex">
            <input
              className="ipt grow" value={unidade} onChange={(e) => setUnidade(e.target.value)}
              placeholder="Unidade (unid, kg, m…)"
            />
            <button className="btn btn-primary" onClick={criar} disabled={salvando || !nome.trim() || !unidade.trim()}>
              {salvando ? '…' : 'Criar'}
            </button>
            <button className="btn btn-ghost" onClick={() => setCriando(false)} aria-label="Cancelar">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      </Campo>
    )
  }

  return (
    <Campo label="Material">
      <div className="row-flex">
        <select
          className="sel grow" value={materialId}
          onChange={(e) => onEscolher(e.target.value)}
        >
          <option value="">Escolha o material</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setCriando(true)}>
          <Icon name="mais_sinal" size={16} /> Novo
        </button>
      </div>
    </Campo>
  )
}
