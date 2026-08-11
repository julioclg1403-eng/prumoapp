/* ============================================================
   UMA REQUISIÇÃO — do rascunho ao recebimento.

   A tela muda de cara conforme a etapa, porque o trabalho muda de
   dono: no rascunho é o campo montando a lista; depois de enviada
   é a gestão cotando e comprando; na chegada é de novo o campo
   conferindo o caminhão.

   O saldo de cada item nunca é digitado. Ele é o que foi pedido
   menos o que já chegou, e some da tela quando zera.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, plural,
  situacaoRequisicao, saldosDaRequisicao, acoesDaRequisicao,
  formatarQuantidade, formatarDinheiro,
} from '../lib/dominio'
import { Icon, Chip, Sheet, Campo, Confirmar, Vazio, ItemLista, TextareaComAudio } from '../components'

const UNIDADES = ['un', 'sc', 'm', 'm²', 'm³', 'kg', 'L', 'cx', 'pç', 'br', 'rl', 'gl']

const linhaVazia = (anterior) => ({
  chave: `l-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  material_id: null,
  descricao: '',
  quantidade: '',
  /* Herda unidade e data da linha anterior: numa requisição de
     vinte itens, quase sempre repetem, e redigitar cansa. */
  unidade: anterior?.unidade || '',
  data_necessidade: anterior?.data_necessidade || '',
  observacao: '',
})

export default function Requisicao({ id, novo, voltar, perfil }) {
  const dados = useDados()
  const hoje = hojeISO()

  const req = useMemo(
    () => (id ? dados.requisicoes.find((r) => r.id === id) : null),
    [id, dados.requisicoes],
  )

  const criando = Boolean(novo) || !req

  const [rascunho, setRascunho] = useState(() => ({
    titulo: req?.titulo || '',
    observacao: req?.observacao || '',
  }))
  const [linhas, setLinhas] = useState(() =>
    req?.itens?.length
      ? req.itens.map((i) => ({
          chave: i.id, id: i.id, material_id: i.material_id, descricao: i.descricao,
          quantidade: String(i.quantidade), unidade: i.unidade || '',
          data_necessidade: i.data_necessidade || '', observacao: i.observacao || '',
        }))
      : [linhaVazia()],
  )
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [comprando, setComprando] = useState(null)
  const [recebendo, setRecebendo] = useState(null)

  /* Se o pedido mudar de etapa por outra via, a tela acompanha em
     vez de continuar mostrando o estado antigo. */
  useEffect(() => {
    if (req && !criando) {
      setRascunho({ titulo: req.titulo || '', observacao: req.observacao || '' })
    }
  }, [req?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const saldos = req ? saldosDaRequisicao(req) : null
  const sit = req ? situacaoRequisicao(req, hoje) : null
  const acoes = req ? acoesDaRequisicao(req, perfil) : { podeEditarItens: true }
  const editandoItens = criando || (acoes.podeEditarItens && req?.status === 'rascunho')

  const mostrarRecado = (texto) => { setAviso(texto); setTimeout(() => setAviso(''), 3000) }

  /* ── Itens ─────────────────────────────────────────────── */

  const mudarLinha = (chave, campo, valor) =>
    setLinhas((ls) => ls.map((l) => {
      if (l.chave !== chave) return l
      const nova = { ...l, [campo]: valor }
      if (campo === 'descricao') {
        /* Escolheu um material do catálogo: já traz a unidade
           habitual dele, para não digitar duas vezes. */
        const conhecido = dados.materiais.find(
          (m) => m.nome.toLowerCase() === valor.trim().toLowerCase(),
        )
        nova.material_id = conhecido?.id || null
        if (conhecido?.unidade_padrao && !l.unidade) nova.unidade = conhecido.unidade_padrao
      }
      return nova
    }))

  const acrescentarLinha = () =>
    setLinhas((ls) => [...ls, linhaVazia(ls[ls.length - 1])])

  const duplicarLinha = (chave) =>
    setLinhas((ls) => {
      const i = ls.findIndex((l) => l.chave === chave)
      const copia = { ...ls[i], chave: `l-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, id: undefined }
      return [...ls.slice(0, i + 1), copia, ...ls.slice(i + 1)]
    })

  const removerLinha = (chave) =>
    setLinhas((ls) => (ls.length === 1 ? [linhaVazia()] : ls.filter((l) => l.chave !== chave)))

  const linhasValidas = linhas.filter((l) => l.descricao.trim() && Number(l.quantidade) > 0)

  /* Materiais novos entram no catálogo na hora de salvar — assim a
     pessoa não precisa cadastrar antes para poder pedir. */
  const registrarMateriaisNovos = async () => {
    for (const l of linhasValidas) {
      if (!l.material_id && l.descricao.trim()) {
        const m = await dados.salvarMaterial({ nome: l.descricao, unidade_padrao: l.unidade })
        if (m) l.material_id = m.id
      }
    }
  }

  const salvar = async (status) => {
    if (!linhasValidas.length) { mostrarRecado('Escreva ao menos um item com quantidade.'); return null }
    setSalvando(true)
    await registrarMateriaisNovos()
    const salva = await dados.salvarRequisicao(
      {
        ...(req?.id ? { id: req.id } : {}),
        ...rascunho,
        status: status || req?.status || 'rascunho',
        autor_id: req?.autor_id || perfil.id,
        ...(status === 'enviada' ? { data_envio: hoje } : {}),
      },
      linhasValidas,
    )
    setSalvando(false)
    if (!salva) return null
    if (criando) { voltar(); return salva }
    mostrarRecado(status === 'enviada' ? 'Requisição enviada.' : 'Salvo.')
    return salva
  }

  /* ── Etapas ────────────────────────────────────────────── */

  const enviar = () => {
    if (!linhasValidas.length) { mostrarRecado('Escreva ao menos um item com quantidade.'); return }
    setConfirmar({
      titulo: 'Enviar a requisição?',
      texto: `A partir daqui ela deixa de ser seu rascunho e passa a ser vista pela gestão, com ${plural(linhasValidas.length, 'item', 'itens')}. Você não poderá mais alterar os itens.`,
      rotuloOk: 'Enviar',
      onOk: async () => { setConfirmar(null); await salvar('enviada') },
    })
  }

  const registrarCompra = async () => {
    setSalvando(true)
    const ok = await dados.moverRequisicao(req.id, 'comprada', {
      fornecedor: (comprando.fornecedor || '').trim() || null,
      valor_total: comprando.valor_total === '' ? null : Number(comprando.valor_total),
      previsao_entrega: comprando.previsao_entrega || null,
    })
    setSalvando(false)
    if (ok) { setComprando(null); mostrarRecado('Compra registrada.') }
  }

  const abrirRecebimento = () => {
    setRecebendo({
      data: hoje,
      observacao: '',
      /* Já vem preenchido com o saldo de cada item: o caso comum é
         chegar tudo o que falta, e aí é só confirmar. */
      quantidades: Object.fromEntries(
        saldos.itens.filter((i) => !i.completo).map((i) => [i.id, String(i.saldo)]),
      ),
    })
  }

  const confirmarRecebimento = async () => {
    const itens = Object.entries(recebendo.quantidades)
      .map(([item_id, q]) => ({ item_id, quantidade: Number(q) }))
      .filter((i) => i.quantidade > 0)
    if (!itens.length) { mostrarRecado('Informe o que chegou.'); return }
    setSalvando(true)
    const ok = await dados.registrarEntrega({
      requestId: req.id, data: recebendo.data,
      observacao: recebendo.observacao, itens,
    })
    setSalvando(false)
    if (ok) {
      setRecebendo(null)
      const novos = saldosDaRequisicao(ok)
      mostrarRecado(novos.temSaldo ? 'Entrega parcial registrada. O saldo continua pendente.' : 'Pedido recebido por completo.')
    }
  }

  /* ── Tela ──────────────────────────────────────────────── */

  if (!criando && !req) {
    return (
      <>
        <div className="topbar">
          <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>
          <div className="grow"><div style={{ fontSize: 17, fontWeight: 700 }}>Pedido</div></div>
        </div>
        <div className="page">
          <div className="card-flat">
            <Vazio titulo="Pedido não encontrado" texto="Ele pode ter sido excluído ou ser o rascunho de outra pessoa." />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="topbar">
        <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {criando ? 'Nova requisição' : `Pedido #${req.numero}`}
          </div>
          {req && (
            <div className="sub">
              {dados.perfilPorId(req.autor_id)?.nome || '—'} · {formatarData(req.created_at)}
            </div>
          )}
        </div>
        {sit && <Chip tom={sit.tom}>{sit.rotulo}</Chip>}
      </div>

      <div className="page" style={{ paddingBottom: 100 }}>
        <div className="stack-3">
          {aviso && <div className="alert success">{aviso}</div>}

          {/* ── Andamento ── */}
          {req && !criando && <Trilha req={req} saldos={saldos} />}

          {/* ── Cabeçalho ── */}
          <div className="card stack-2">
            <Campo label="Título" dica="Opcional. Ajuda a achar depois — «alvenaria 15º pav», «elétrica subsolo».">
              <input
                className="ipt" value={rascunho.titulo} disabled={!editandoItens}
                onChange={(e) => setRascunho((r) => ({ ...r, titulo: e.target.value }))}
                placeholder="Para que é este pedido"
              />
            </Campo>
            <Campo label="Observação">
              <TextareaComAudio
                style={{ minHeight: 60 }} value={rascunho.observacao}
                disabled={!editandoItens && !acoes.podeEditarItens}
                onChange={(e) => setRascunho((r) => ({ ...r, observacao: e.target.value }))}
                placeholder="Algo que quem vai comprar precisa saber"
              />
            </Campo>
          </div>

          {/* ── Itens ── */}
          {editandoItens ? (
            <EditorDeItens
              linhas={linhas} dados={dados}
              onMudar={mudarLinha} onAcrescentar={acrescentarLinha}
              onDuplicar={duplicarLinha} onRemover={removerLinha}
            />
          ) : (
            <ItensComSaldo saldos={saldos} />
          )}

          {/* ── Compra ── */}
          {req && ['comprada', 'em_transito', 'recebida'].includes(req.status) && (
            <div className="card-flat stack-1">
              <div className="t-micro" style={{ marginBottom: 4 }}>Compra</div>
              <div className="row-between"><span className="t-caption">Fornecedor</span>
                <span className="t-strong" style={{ fontSize: 14 }}>{req.fornecedor || '—'}</span></div>
              <div className="row-between"><span className="t-caption">Valor</span>
                <span className="t-strong t-num" style={{ fontSize: 14 }}>{formatarDinheiro(req.valor_total)}</span></div>
              <div className="row-between"><span className="t-caption">Comprado em</span>
                <span className="t-strong" style={{ fontSize: 14 }}>{formatarData(req.data_compra)}</span></div>
              <div className="row-between"><span className="t-caption">Previsão de entrega</span>
                <span className="t-strong" style={{ fontSize: 14, color: sit?.atrasada ? 'var(--danger)' : undefined }}>
                  {formatarData(req.previsao_entrega)}
                </span></div>
            </div>
          )}

          {/* ── Entregas ── */}
          {req && (req.entregas || []).length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 8 }}>
                Entregas · {plural(req.entregas.length, 'registro', 'registros')}
              </div>
              <div className="stack-1">
                {req.entregas.map((e) => (
                  <ItemLista
                    key={e.id}
                    titulo={formatarData(e.data)}
                    sub={
                      `${plural((e.itens || []).length, 'item recebido', 'itens recebidos')}` +
                      ` · ${dados.perfilPorId(e.responsavel_id)?.nome || '—'}` +
                      (e.observacao ? ` · ${e.observacao}` : '')
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Barra de ação ── */}
      <BarraDeAcoes
        criando={criando} req={req} acoes={acoes} saldos={saldos} salvando={salvando}
        onSalvarRascunho={() => salvar('rascunho')}
        onEnviar={enviar}
        onAssumir={async () => { await dados.moverRequisicao(req.id, 'em_cotacao'); mostrarRecado('Você assumiu este pedido.') }}
        onComprar={() => setComprando({ fornecedor: req.fornecedor || '', valor_total: req.valor_total ?? '', previsao_entrega: req.previsao_entrega || '' })}
        onDespachar={async () => { await dados.moverRequisicao(req.id, 'em_transito'); mostrarRecado('Pedido em trânsito.') }}
        onReceber={abrirRecebimento}
        onExcluir={() => setConfirmar({
          titulo: 'Excluir este rascunho?',
          texto: 'Ele ainda não foi enviado, então ninguém mais o viu. Isso não tem volta.',
          rotuloOk: 'Excluir', perigo: true,
          onOk: async () => { setConfirmar(null); const ok = await dados.excluirRequisicao(req.id); if (ok) voltar() },
        })}
      />

      {/* ── Registrar compra ── */}
      <Sheet
        aberto={Boolean(comprando)} titulo="Registrar a compra"
        onFechar={() => setComprando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setComprando(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={registrarCompra} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Registrar compra'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Fornecedor">
            <input className="ipt" value={comprando?.fornecedor || ''} autoFocus
                   onChange={(e) => setComprando((c) => ({ ...c, fornecedor: e.target.value }))} />
          </Campo>
          <Campo label="Valor total">
            <input className="ipt" type="number" inputMode="decimal" step="0.01"
                   value={comprando?.valor_total ?? ''}
                   onChange={(e) => setComprando((c) => ({ ...c, valor_total: e.target.value }))}
                   placeholder="Opcional" />
          </Campo>
          <Campo label="Previsão de entrega" dica="É a partir desta data que o pedido passa a aparecer como atrasado.">
            <input className="ipt" type="date" value={comprando?.previsao_entrega || ''}
                   onChange={(e) => setComprando((c) => ({ ...c, previsao_entrega: e.target.value }))} />
          </Campo>
        </div>
      </Sheet>

      {/* ── Receber ── */}
      <Sheet
        aberto={Boolean(recebendo)} titulo="Registrar recebimento"
        onFechar={() => setRecebendo(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setRecebendo(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={confirmarRecebimento} disabled={salvando}>
              {salvando ? 'Gravando…' : 'Confirmar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <div className="alert info">
            Já vem preenchido com o que <strong>falta</strong> de cada item. Se chegou menos, corrija a
            quantidade — o saldo continua pendente e o pedido segue em trânsito.
          </div>

          <Campo label="Data da entrega">
            <input className="ipt" type="date" value={recebendo?.data || ''}
                   onChange={(e) => setRecebendo((r) => ({ ...r, data: e.target.value }))} />
          </Campo>

          <div className="stack-1">
            {saldos?.itens.filter((i) => !i.completo).map((i) => (
              <div key={i.id} className="card-flat" style={{ padding: 12 }}>
                <div className="t-strong" style={{ fontSize: 14 }}>{i.descricao}</div>
                <div className="t-caption" style={{ marginBottom: 8 }}>
                  Pedido {formatarQuantidade(i.pedido)} {i.unidade || ''}
                  {i.recebido > 0 && ` · já chegaram ${formatarQuantidade(i.recebido)}`}
                  {' · '}<strong>falta {formatarQuantidade(i.saldo)}</strong>
                </div>
                <input
                  className="ipt" type="number" inputMode="decimal" step="0.001" min="0"
                  max={i.saldo}
                  value={recebendo?.quantidades?.[i.id] ?? ''}
                  onChange={(e) => setRecebendo((r) => ({
                    ...r, quantidades: { ...r.quantidades, [i.id]: e.target.value },
                  }))}
                  placeholder="Quanto chegou"
                />
              </div>
            ))}
          </div>

          <Campo label="Observação">
            <input className="ipt" value={recebendo?.observacao || ''}
                   onChange={(e) => setRecebendo((r) => ({ ...r, observacao: e.target.value }))}
                   placeholder="Nota fiscal, avaria, quem entregou…" />
          </Campo>
        </div>
      </Sheet>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo} texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk} perigo={confirmar?.perigo}
        onOk={confirmar?.onOk} onCancelar={() => setConfirmar(null)}
      />
    </>
  )
}

/* ── Trilha do pedido ─────────────────────────────────────── */

function Trilha({ req, saldos }) {
  const etapas = [
    { chave: 'rascunho', rotulo: 'Rascunho' },
    { chave: 'enviada', rotulo: 'Enviada' },
    { chave: 'em_cotacao', rotulo: 'Cotação' },
    { chave: 'comprada', rotulo: 'Comprada' },
    { chave: 'em_transito', rotulo: 'Trânsito' },
    { chave: 'recebida', rotulo: 'Recebida' },
  ]
  const atual = etapas.findIndex((e) => e.chave === req.status)

  if (req.status === 'cancelada') {
    return <div className="alert danger">Este pedido foi cancelado.</div>
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="steps" style={{ marginBottom: 10 }}>
        {etapas.map((e, i) => <div key={e.chave} data-on={i <= atual ? '1' : '0'} />)}
      </div>
      <div className="row-between">
        <span className="t-strong" style={{ fontSize: 14 }}>{etapas[atual]?.rotulo || req.status}</span>
        {saldos?.entrega === 'parcial' && (
          <span className="t-caption" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            faltam {saldos.totalItens - saldos.itensCompletos} de {saldos.totalItens} itens
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Itens em edição ──────────────────────────────────────── */

function EditorDeItens({ linhas, dados, onMudar, onAcrescentar, onDuplicar, onRemover }) {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="t-micro">Itens</div>
        <button className="btn btn-secondary btn-sm" onClick={onAcrescentar}>
          <Icon name="mais_sinal" size={15} /> Item
        </button>
      </div>

      {/* Lista de sugestões do catálogo. Vem ordenada por
          frequência de uso, então o que a obra mais pede aparece
          primeiro. */}
      <datalist id="catalogo-materiais">
        {dados.materiais.filter((m) => m.ativo !== false).map((m) => (
          <option key={m.id} value={m.nome} />
        ))}
      </datalist>

      <div className="stack-2">
        {linhas.map((l, i) => (
          <div key={l.chave} className="card-flat" style={{ padding: 12 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="t-micro">Item {i + 1}</span>
              <div className="row-flex" style={{ gap: 2 }}>
                <button className="btn btn-ghost btn-sm" style={{ padding: 4, height: 28 }}
                        onClick={() => onDuplicar(l.chave)} aria-label="Duplicar item">
                  <Icon name="mais_sinal" size={14} />
                </button>
                <button className="btn btn-ghost btn-sm" style={{ padding: 4, height: 28 }}
                        onClick={() => onRemover(l.chave)} aria-label="Remover item">
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <input
              className="ipt" list="catalogo-materiais" value={l.descricao}
              onChange={(e) => onMudar(l.chave, 'descricao', e.target.value)}
              placeholder="Material — digite e escolha, ou escreva um novo"
            />

            <div className="row-flex" style={{ marginTop: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 2 }}>
                <input
                  className="ipt" type="number" inputMode="decimal" step="0.001" min="0"
                  value={l.quantidade}
                  onChange={(e) => onMudar(l.chave, 'quantidade', e.target.value)}
                  placeholder="Quantidade"
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  className="ipt" list="unidades-comuns" value={l.unidade}
                  onChange={(e) => onMudar(l.chave, 'unidade', e.target.value)}
                  placeholder="un"
                />
              </div>
            </div>

            <div className="row-flex" style={{ marginTop: 8 }}>
              <div className="grow">
                <input
                  className="ipt" type="date" value={l.data_necessidade}
                  onChange={(e) => onMudar(l.chave, 'data_necessidade', e.target.value)}
                  title="Quando precisa estar na obra"
                />
              </div>
            </div>

            <input
              className="ipt" style={{ marginTop: 8 }} value={l.observacao}
              onChange={(e) => onMudar(l.chave, 'observacao', e.target.value)}
              placeholder="Observação do item (opcional)"
            />
          </div>
        ))}
      </div>

      <datalist id="unidades-comuns">
        {UNIDADES.map((u) => <option key={u} value={u} />)}
      </datalist>

      <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={onAcrescentar}>
        <Icon name="mais_sinal" size={18} /> Acrescentar item
      </button>
    </div>
  )
}

/* ── Itens com saldo ──────────────────────────────────────── */

function ItensComSaldo({ saldos }) {
  if (!saldos || saldos.totalItens === 0) {
    return <div className="card-flat"><Vazio titulo="Sem itens" texto="Este pedido não tem nenhum item." /></div>
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="t-micro">Itens</div>
        <span className="t-caption">
          {saldos.itensCompletos} de {saldos.totalItens} completos
        </span>
      </div>
      <div className="stack-1">
        {saldos.itens.map((i) => (
          <div
            key={i.id} className="card-flat" style={{
              padding: 12,
              borderLeft: `3px solid ${i.completo ? 'var(--success)' : i.recebido > 0 ? 'var(--info)' : 'var(--border-strong)'}`,
            }}
          >
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="t-strong" style={{ fontSize: 14 }}>{i.descricao}</div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  Pedido {formatarQuantidade(i.pedido)} {i.unidade || ''}
                  {i.data_necessidade && ` · para ${formatarData(i.data_necessidade)}`}
                </div>
                {i.observacao && (
                  <div className="t-caption" style={{ marginTop: 2, color: 'var(--text-3)' }}>{i.observacao}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                {i.completo ? (
                  <Chip tom="success">Completo</Chip>
                ) : i.recebido > 0 ? (
                  <div>
                    <Chip tom="info">Parcial</Chip>
                    <div className="t-num" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, fontWeight: 600 }}>
                      falta {formatarQuantidade(i.saldo)} {i.unidade || ''}
                    </div>
                  </div>
                ) : (
                  <Chip>Pendente</Chip>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Barra de ação fixa ───────────────────────────────────── */

function BarraDeAcoes({
  criando, req, acoes, saldos, salvando,
  onSalvarRascunho, onEnviar, onAssumir, onComprar, onDespachar, onReceber, onExcluir,
}) {
  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="row-flex" style={{ maxWidth: 1180, margin: '0 auto', flexWrap: 'wrap' }}>
        {(criando || req?.status === 'rascunho') && (
          <>
            <button className="btn btn-secondary" onClick={onSalvarRascunho} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            <div className="grow" />
            {acoes.podeExcluir && (
              <button className="btn btn-ghost btn-sm" onClick={onExcluir}>Excluir</button>
            )}
            <button className="btn btn-primary" onClick={onEnviar} disabled={salvando}>
              Enviar <Icon name="avancar" size={18} />
            </button>
          </>
        )}

        {req?.status === 'enviada' && (
          <>
            {acoes.podeAssumir && (
              <button className="btn btn-secondary" onClick={onAssumir} disabled={salvando}>
                Assumir cotação
              </button>
            )}
            <div className="grow" />
            {acoes.podeComprar && (
              <button className="btn btn-primary" onClick={onComprar} disabled={salvando}>
                Registrar compra
              </button>
            )}
          </>
        )}

        {req?.status === 'em_cotacao' && (
          <>
            <span className="t-caption grow">Em cotação</span>
            {acoes.podeComprar && (
              <button className="btn btn-primary" onClick={onComprar} disabled={salvando}>
                Registrar compra
              </button>
            )}
          </>
        )}

        {req?.status === 'comprada' && (
          <>
            {acoes.podeDespachar && (
              <button className="btn btn-secondary" onClick={onDespachar} disabled={salvando}>
                Marcar em trânsito
              </button>
            )}
            <div className="grow" />
            {acoes.podeReceber && (
              <button className="btn btn-primary" onClick={onReceber} disabled={salvando}>
                Registrar recebimento
              </button>
            )}
          </>
        )}

        {req?.status === 'em_transito' && (
          <>
            <span className="t-caption grow">
              {saldos?.entrega === 'parcial' ? 'Entrega parcial — falta material' : 'A caminho'}
            </span>
            {acoes.podeReceber && (
              <button className="btn btn-primary" onClick={onReceber} disabled={salvando}>
                Registrar recebimento
              </button>
            )}
          </>
        )}

        {req?.status === 'recebida' && (
          <div className="row-flex grow" style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>
            <Icon name="check" size={18} /> Pedido recebido por completo
          </div>
        )}
      </div>
    </div>
  )
}
