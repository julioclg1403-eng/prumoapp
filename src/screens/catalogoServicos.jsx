/* ============================================================
   CATÁLOGO DE SERVIÇOS — vive dentro de Cadastros (pseudo-aba, igual
   Notificações), gestão+admin. Base do módulo Produtividade e
   Medição: cada tipo de serviço (sapata, alvenaria, viga...) define
   quais dimensões o formulário de marcação pede, a fórmula que
   converte essas dimensões na quantidade da unidade do contrato
   (m³/m²/ml/un), e a sequência de estágios (com cor) que o pino na
   planta assume.

   Não cabe no TIPOS genérico de cadastros.jsx: campos de dimensão e
   estágios são listas configuráveis, não um formulário de campos
   fixos — mesmo motivo que Planejamento (estruturaCustos) e
   Notificações já são bespoke.
   ============================================================ */

import { useMemo, useState } from 'react'
import { Icon, Chip, Sheet, Campo, Vazio } from '../components'
import { validarFormula } from '../lib/formulaProducao'

const UNIDADES = ['m3', 'm2', 'ml', 'un', 'kg']
const ROTULO_UNIDADE = { m3: 'm³', m2: 'm²', ml: 'ml', un: 'un', kg: 'kg' }
const CORES = [
  { valor: '', rotulo: 'Neutro' },
  { valor: 'info', rotulo: 'Azul' },
  { valor: 'success', rotulo: 'Verde' },
  { valor: 'danger', rotulo: 'Vermelho' },
]
const ROTULO_COR = Object.fromEntries(CORES.map((c) => [c.valor, c.rotulo]))

function slugificar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const VAZIO = { nome: '', unidade_resultado: 'm3', campos_dimensao: [], formula: '', etapas: [] }

export default function CatalogoServicosConteudo({ dados }) {
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)

  const tipos = dados.tiposServico || []
  const lista = tipos.filter((t) => (mostrarArquivados ? t.ativo === false : t.ativo !== false))

  const abrirNovo = () => setEditando({ ...VAZIO })
  const abrirEdicao = (t) => setEditando({ ...t })

  const validacaoFormula = useMemo(() => {
    if (!editando?.formula?.trim()) return null
    return validarFormula(editando.formula, (editando.campos_dimensao || []).map((c) => c.chave))
  }, [editando])

  const podeSalvar = editando?.nome?.trim()
    && (editando?.campos_dimensao || []).length > 0
    && (editando?.campos_dimensao || []).every((c) => c.chave && c.rotulo)
    && validacaoFormula?.ok
    && (editando?.etapas || []).length > 0
    && (editando?.etapas || []).every((e) => e.chave && e.rotulo)

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.salvarTipoServico(editando)
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const adicionarCampoDimensao = () => setEditando((e) => ({
    ...e, campos_dimensao: [...(e.campos_dimensao || []), { chave: '', rotulo: '' }],
  }))
  const mudarCampoDimensao = (i, patch) => setEditando((e) => ({
    ...e,
    campos_dimensao: e.campos_dimensao.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
  }))
  const removerCampoDimensao = (i) => setEditando((e) => ({
    ...e, campos_dimensao: e.campos_dimensao.filter((_, idx) => idx !== i),
  }))

  const adicionarEtapa = () => setEditando((e) => ({
    ...e, etapas: [...(e.etapas || []), { chave: '', rotulo: '', cor: '' }],
  }))
  const mudarEtapa = (i, patch) => setEditando((e) => ({
    ...e, etapas: e.etapas.map((et, idx) => (idx === i ? { ...et, ...patch } : et)),
  }))
  const removerEtapa = (i) => setEditando((e) => ({
    ...e, etapas: e.etapas.filter((_, idx) => idx !== i),
  }))
  const moverEtapa = (i, dir) => setEditando((e) => {
    const novas = [...e.etapas]
    const j = i + dir
    if (j < 0 || j >= novas.length) return e
    ;[novas[i], novas[j]] = [novas[j], novas[i]]
    return { ...e, etapas: novas }
  })

  return (
    <div className="stack-2">
      <div className="alert info">
        Cada tipo de serviço define as dimensões que o formulário de marcação pede, a fórmula que
        calcula a quantidade (na unidade do contrato) e os estágios — em ordem — que o pino na
        planta percorre, cada um com sua cor.
      </div>

      <div className="row-between" style={{ alignItems: 'center' }}>
        <div className="row-wrap" style={{ gap: 6 }}>
          <button className={`btn btn-sm ${!mostrarArquivados ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setMostrarArquivados(false)}>
            Ativos
          </button>
          <button className={`btn btn-sm ${mostrarArquivados ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setMostrarArquivados(true)}>
            Arquivados
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={abrirNovo}>
          <Icon name="mais_sinal" size={16} /> Novo tipo de serviço
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo={mostrarArquivados ? 'Nenhum arquivado' : 'Nenhum tipo de serviço cadastrado'}
            texto={mostrarArquivados ? '' : 'Cadastre o primeiro (ex.: Sapata, Alvenaria, Pilar) pra começar a marcar na planta.'}
            acao={!mostrarArquivados && <button className="btn btn-primary" onClick={abrirNovo}>Novo tipo de serviço</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {lista.map((t) => (
            <div key={t.id} className="card-flat" style={{ padding: 10 }}>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="t-strong" style={{ fontSize: 15 }}>{t.nome}</div>
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    Unidade: {ROTULO_UNIDADE[t.unidade_resultado] || t.unidade_resultado} · fórmula: {t.formula}
                  </div>
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    Dimensões: {(t.campos_dimensao || []).map((c) => c.rotulo).join(', ') || '—'}
                  </div>
                  <div className="row-wrap" style={{ gap: 6, marginTop: 6 }}>
                    {(t.etapas || []).map((e, i) => (
                      <Chip key={e.chave} tom={e.cor}>{i + 1}. {e.rotulo}</Chip>
                    ))}
                  </div>
                </div>
                <div className="row-flex" style={{ gap: 4, flex: 'none' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(t)} aria-label="Editar">
                    <Icon name="editar" size={16} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm" onClick={() => dados.arquivarTipoServico(t.id)}
                    aria-label={t.ativo === false ? 'Reativar' : 'Arquivar'}
                  >
                    <Icon name={t.ativo === false ? 'check' : 'x'} size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={salvar} disabled={salvando || !podeSalvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editando && (
          <div className="stack-2">
            <Campo label="Nome">
              <input
                className="ipt" autoFocus value={editando.nome}
                placeholder="Sapata, Alvenaria, Viga…"
                onChange={(e) => setEditando((x) => ({ ...x, nome: e.target.value }))}
              />
            </Campo>

            <Campo label="Unidade do resultado" dica="A unidade em que a quantidade calculada entra na medição — bata com a unidade do item no Contratos.">
              <select
                className="sel" value={editando.unidade_resultado}
                onChange={(e) => setEditando((x) => ({ ...x, unidade_resultado: e.target.value }))}
              >
                {UNIDADES.map((u) => <option key={u} value={u}>{ROTULO_UNIDADE[u]}</option>)}
              </select>
            </Campo>

            <Campo label="Campos de dimensão" dica="O que o formulário de marcação vai pedir — ex.: largura, comprimento, altura.">
              <div className="stack-1">
                {(editando.campos_dimensao || []).map((c, i) => (
                  <div key={i} className="row-flex" style={{ gap: 6 }}>
                    <input
                      className="ipt grow" placeholder="Rótulo (ex.: Largura)" value={c.rotulo}
                      onChange={(e) => mudarCampoDimensao(i, { rotulo: e.target.value, chave: c.chave || slugificar(e.target.value) })}
                    />
                    <input
                      className="ipt" style={{ width: 120 }} placeholder="chave" value={c.chave}
                      onChange={(e) => mudarCampoDimensao(i, { chave: slugificar(e.target.value) })}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => removerCampoDimensao(i)} aria-label="Remover">
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" onClick={adicionarCampoDimensao}>
                  <Icon name="mais_sinal" size={14} /> Adicionar dimensão
                </button>
              </div>
            </Campo>

            <Campo label="Fórmula" dica="Usa as chaves das dimensões acima — ex.: largura * comprimento * altura.">
              <input
                className="ipt" value={editando.formula} placeholder="largura * comprimento * altura"
                onChange={(e) => setEditando((x) => ({ ...x, formula: e.target.value }))}
              />
              {editando.formula.trim() && (
                <div className="t-caption" style={{ marginTop: 4, color: validacaoFormula?.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {validacaoFormula?.ok ? 'Fórmula válida.' : validacaoFormula?.erro}
                </div>
              )}
            </Campo>

            <Campo label="Estágios" dica="Em ordem — a cor de cada um aparece no pino da planta enquanto ele estiver nesse estágio.">
              <div className="stack-1">
                {(editando.etapas || []).map((e, i) => (
                  <div key={i} className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
                    <span className="t-caption" style={{ width: 16 }}>{i + 1}.</span>
                    <input
                      className="ipt grow" placeholder="Rótulo (ex.: Concretada)" value={e.rotulo}
                      onChange={(ev) => mudarEtapa(i, { rotulo: ev.target.value, chave: e.chave || slugificar(ev.target.value) })}
                    />
                    <select className="sel" style={{ width: 110 }} value={e.cor} onChange={(ev) => mudarEtapa(i, { cor: ev.target.value })}>
                      {CORES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => moverEtapa(i, -1)} disabled={i === 0} aria-label="Mover pra cima">
                      <Icon name="avancar" size={14} style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => moverEtapa(i, 1)} disabled={i === editando.etapas.length - 1} aria-label="Mover pra baixo">
                      <Icon name="avancar" size={14} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => removerEtapa(i)} aria-label="Remover">
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" onClick={adicionarEtapa}>
                  <Icon name="mais_sinal" size={14} /> Adicionar estágio
                </button>
              </div>
            </Campo>
          </div>
        )}
      </Sheet>
    </div>
  )
}

export { ROTULO_COR }
