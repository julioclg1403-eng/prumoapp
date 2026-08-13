/* ============================================================
   ALMOXARIFADO — REFEIÇÕES

   Modelado em cima das duas planilhas do Julio (terceirizado e
   próprio) — são a mesma coisa, data × empresa × quantidade, só que
   a de terceirizado tem uma coluna por empresa e a de próprio só
   uma. Essa distinção já existe no cadastro de empresas
   (`tipo`: 'propria'/'empreiteira'), então não virou campo novo —
   o resumo do mês só agrupa por ela.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarDataCurta, somarMeses, rotuloMes, plural, resumoRefeicoesDoMes,
} from '../lib/dominio'
import { Icon, PageHeader, Sheet, Campo, Confirmar, Vazio, ItemLista } from '../components'

export default function AlmoxarifadoRefeicoes({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [mes, setMes] = useState(() => hoje.slice(0, 7))
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const empresasAtivas = useMemo(
    () => (dados.empresas || []).filter((e) => e.ativo !== false),
    [dados.empresas],
  )
  const resumo = useMemo(
    () => resumoRefeicoesDoMes(dados.refeicoes, dados.empresas, mes),
    [dados.refeicoes, dados.empresas, mes],
  )
  const registrosOrdenados = useMemo(
    () => [...resumo.registros].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [resumo.registros],
  )

  const nomeEmpresa = (id) => dados.empresas?.find((e) => e.id === id)?.nome || 'Empresa removida'

  const abrirNovo = () => setEditando({ data: hoje, company_id: '', quantidade: '', fornecedor: '' })

  const salvar = async () => {
    if (!editando?.company_id || !editando?.data || !Number(editando?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarRefeicao(editando)
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const pedirExcluir = (item) => setConfirmar({
    titulo: 'Excluir lançamento?',
    texto: `«${nomeEmpresa(item.company_id)}» (${item.quantidade} refeições em ${formatarDataCurta(item.data)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirRefeicao(item.id) },
  })

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Refeições"
        sub={`${plural(resumo.registros.length, 'lançamento', 'lançamentos')} em ${rotuloMes(mes).toLowerCase()}`}
        acao={
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Icon name="mais_sinal" size={18} /> Nova refeição
          </button>
        }
      />

      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setMes(hoje.slice(0, 7))}>
          Este mês
        </button>
        <div className="row-flex" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
            <Icon name="voltar" size={16} />
          </button>
          <div className="t-strong" style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }}>
            {rotuloMes(mes)}
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}>
            <Icon name="avancar" size={16} />
          </button>
        </div>
      </div>

      {resumo.totalGeral > 0 && (
        <div className="card stack-2">
          <div className="row-between">
            <div className="t-micro">Total do mês</div>
            <span className="t-num t-strong" style={{ fontSize: 20 }}>{resumo.totalGeral}</span>
          </div>

          {resumo.proprias.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Equipe própria</div>
              <div className="stack-1">
                {resumo.proprias.map((l) => (
                  <div key={l.companyId} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resumo.terceirizadas.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Terceirizados</div>
              <div className="stack-1">
                {resumo.terceirizadas.map((l) => (
                  <div key={l.companyId} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {registrosOrdenados.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma refeição lançada"
            texto={`Nenhum lançamento em ${rotuloMes(mes).toLowerCase()}. Toda vez que o restaurante servir, lança aqui.`}
            acao={<button className="btn btn-primary" onClick={abrirNovo}>Nova refeição</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {registrosOrdenados.map((r) => (
            <ItemLista
              key={r.id}
              titulo={nomeEmpresa(r.company_id)}
              sub={[formatarDataCurta(r.data), r.fornecedor].filter(Boolean).join(' · ')}
              direita={
                <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="t-strong" style={{ fontSize: 15 }}>{r.quantidade}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditando({ ...r })}
                    aria-label="Editar"
                  >
                    <Icon name="editar" size={15} />
                  </button>
                  {podeExcluir && (
                    <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluir(r)} aria-label="Excluir">
                      <Icon name="x" size={15} />
                    </button>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar lançamento' : 'Nova refeição'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.company_id || !editando?.data || !Number(editando?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editando && (
          <div className="stack-2">
            <Campo label="Empresa">
              <select
                className="sel" value={editando.company_id}
                onChange={(e) => setEditando((p) => ({ ...p, company_id: e.target.value }))}
              >
                <option value="">Escolha a empresa</option>
                {empresasAtivas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome} · {emp.tipo === 'propria' ? 'equipe própria' : 'empreiteira'}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="row-flex">
              <Campo label="Quantidade">
                <input
                  className="ipt" type="number" inputMode="numeric" min="0" step="1"
                  value={editando.quantidade}
                  onChange={(e) => setEditando((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={editando.data}
                  onChange={(e) => setEditando((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <Campo label="Fornecedor" dica="Opcional — o restaurante que serviu.">
              <input
                className="ipt" value={editando.fornecedor || ''}
                onChange={(e) => setEditando((p) => ({ ...p, fornecedor: e.target.value }))}
              />
            </Campo>
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
