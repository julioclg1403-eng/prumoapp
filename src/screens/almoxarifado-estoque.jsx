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

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, formatarDataCurta, plural, saldoEstoque } from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista,
} from '../components'

export default function AlmoxarifadoEstoque({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [aba, setAba] = useState('saldo')
  const [busca, setBusca] = useState('')
  const [novaEntrada, setNovaEntrada] = useState(null)
  const [novaSaida, setNovaSaida] = useState(null)
  const [editandoMaterial, setEditandoMaterial] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)

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

  const entradas = useMemo(
    () => [...(dados.entradasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.entradasEstoque],
  )
  const saidas = useMemo(
    () => [...(dados.saidasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.saidasEstoque],
  )

  const nomeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.nome || 'Material removido'
  const unidadeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.unidade || ''

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
            <button className="btn btn-secondary" onClick={() => setNovaSaida({ data: hoje, material_id: '', quantidade: '', destino: '' })}>
              <Icon name="baixar" size={16} /> Registrar saída
            </button>
            <button className="btn btn-primary" onClick={() => setNovaEntrada({ data: hoje, material_id: '', quantidade: '', fornecedor: '', nota_fiscal: '', data_nota: '', valor_total: '' })}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Nova entrada
            </button>
          </div>
        }
      />

      <Segmentos
        valor={aba} onChange={setAba}
        opcoes={[
          { valor: 'saldo', rotulo: 'Saldo', contador: materiais.length },
          { valor: 'entradas', rotulo: 'Entradas', contador: entradas.length },
          { valor: 'saidas', rotulo: 'Saídas', contador: saidas.length },
        ]}
      />

      {aba === 'saldo' && (
        <div className="stack-2">
          {materiais.length > 0 && (
            <input
              className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar material…"
            />
          )}
          {saldosFiltrados.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo={materiais.length === 0 ? 'Nenhum material cadastrado' : 'Nada com esse nome'}
                texto={
                  materiais.length === 0
                    ? 'Cadastre o primeiro material lançando uma entrada — não precisa de passo separado.'
                    : 'Troque a busca ou limpe o campo.'
                }
                acao={materiais.length === 0 && (
                  <button className="btn btn-primary" onClick={() => setNovaEntrada({ data: hoje, material_id: '', quantidade: '', fornecedor: '', nota_fiscal: '', data_nota: '', valor_total: '' })}>
                    Lançar entrada
                  </button>
                )}
              />
            </div>
          ) : (
            <div className="stack-1">
              {saldosFiltrados.map((s) => (
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
      )}

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
                sub={[formatarDataCurta(e.data), e.fornecedor, e.nota_fiscal ? `NF ${e.nota_fiscal}` : null].filter(Boolean).join(' · ')}
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
            <Campo label="Fornecedor" dica="Opcional">
              <input
                className="ipt" value={novaEntrada.fornecedor}
                onChange={(e) => setNovaEntrada((p) => ({ ...p, fornecedor: e.target.value }))}
              />
            </Campo>
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
    </div>
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
