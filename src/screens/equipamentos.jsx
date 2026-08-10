/* ============================================================
   EQUIPAMENTOS
   BRIEFING seção 3: o campo CONSULTA equipamento; quem cadastra,
   edita e muda o status é a gestão. Diferente das outras
   "cadastros auxiliares" (empresas, colaboradores…), onde o campo
   pode criar um registro provisório — aqui ele só lê. A trava de
   verdade é a política do banco (equipment_insert/update exigem
   eh_gestao()); esconder os botões aqui evita oferecer um clique
   que a permissão recusaria em silêncio.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { STATUS_EQUIPAMENTO, ROTULO_STATUS_EQUIPAMENTO, TOM_STATUS_EQUIPAMENTO } from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista } from '../components'

export default function Equipamentos({ voltar, perfil }) {
  const dados = useDados()
  const [filtro, setFiltro] = useState('todos')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const podeEditar = perfil?.role !== 'campo'

  const todos = dados.equipamentos || []
  const ativos = todos.filter((e) => e.ativo !== false)
  const arquivados = todos.filter((e) => e.ativo === false)
  const lista = filtro === 'arquivados' ? arquivados
    : filtro === 'todos' ? ativos
      : ativos.filter((e) => e.status === filtro)

  const abrirNovo = () => setEditando({ status: 'disponivel' })

  const salvar = async () => {
    if (!editando?.nome?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarCadastro('equipamentos', {
      ...editando,
      nome: editando.nome.trim(),
      tipo: (editando.tipo || '').trim() || null,
      observacao: (editando.observacao || '').trim() || null,
      responsavel_id: editando.responsavel_id || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const pedirArquivar = (item) => {
    const arquivando = item.ativo !== false
    setConfirmar({
      titulo: arquivando ? 'Arquivar equipamento?' : 'Reativar equipamento?',
      texto: arquivando
        ? `«${item.nome}» deixa de aparecer na lista. Nada é apagado.`
        : `«${item.nome}» volta a aparecer na lista.`,
      rotuloOk: arquivando ? 'Arquivar' : 'Reativar',
      perigo: arquivando,
      onOk: async () => { setConfirmar(null); await dados.arquivarCadastro('equipamentos', item.id) },
    })
  }

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Equipamentos</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
        {podeEditar && (
          <button onClick={abrirNovo} aria-label="Novo equipamento"><Icon name="mais_sinal" size={22} /></button>
        )}
      </div>

      <div className="page">
        <PageHeader
          titulo="Equipamentos"
          sub="Máquinas e ferramentas da obra, e onde cada uma está"
          acao={podeEditar && (
            <button className="btn btn-primary" onClick={abrirNovo}>
              <Icon name="mais_sinal" size={18} /> Novo
            </button>
          )}
        />

        <div className="stack-2">
          {!podeEditar && (
            <div className="alert info">
              Você consulta os equipamentos aqui. Cadastrar, editar e mudar o status é com a gestão.
            </div>
          )}

          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'todos', rotulo: 'Todos', contador: ativos.length },
              ...STATUS_EQUIPAMENTO.map((s) => ({
                valor: s, rotulo: ROTULO_STATUS_EQUIPAMENTO[s],
                contador: ativos.filter((e) => e.status === s).length,
              })),
            ]}
          />

          {arquivados.length > 0 && (
            <button
              className={`btn btn-sm ${filtro === 'arquivados' ? 'btn-dark' : 'btn-ghost'}`}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setFiltro((f) => (f === 'arquivados' ? 'todos' : 'arquivados'))}
            >
              {filtro === 'arquivados' ? 'Ver ativos' : `Ver arquivados (${arquivados.length})`}
            </button>
          )}

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada por aqui"
                texto={
                  filtro === 'arquivados'
                    ? 'Nada foi arquivado.'
                    : 'Nenhum equipamento neste filtro.'
                }
                acao={podeEditar && filtro !== 'arquivados' && (
                  <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar equipamento</button>
                )}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((item) => (
                <ItemLista
                  key={item.id}
                  titulo={item.nome}
                  sub={[item.tipo, item.status === 'em_uso' ? dados.perfilPorId(item.responsavel_id)?.nome : null]
                    .filter(Boolean).join(' · ')}
                  direita={
                    <div className="row-flex" style={{ gap: 4 }}>
                      <Chip tom={TOM_STATUS_EQUIPAMENTO[item.status]}>{ROTULO_STATUS_EQUIPAMENTO[item.status]}</Chip>
                      {item.ativo === false && <Chip>Arquivado</Chip>}
                      {podeEditar && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditando({ ...item })}
                            aria-label="Editar"
                          >
                            <Icon name="editar" size={16} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => pedirArquivar(item)}
                            aria-label={item.ativo === false ? 'Reativar' : 'Arquivar'}
                          >
                            <Icon name={item.ativo === false ? 'check' : 'x'} size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar equipamento' : 'Novo equipamento'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.nome?.trim()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Nome">
            <input
              className="ipt" autoFocus value={editando?.nome || ''}
              onChange={(e) => setEditando((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Betoneira 400L, andaime tubular…"
            />
          </Campo>
          <Campo label="Tipo" dica="Opcional — categoria livre, ajuda a agrupar depois.">
            <input
              className="ipt" value={editando?.tipo || ''}
              onChange={(e) => setEditando((p) => ({ ...p, tipo: e.target.value }))}
              placeholder="Máquina, ferramenta, andaime…"
            />
          </Campo>
          <Campo label="Status">
            <select
              className="sel" value={editando?.status || 'disponivel'}
              onChange={(e) => setEditando((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUS_EQUIPAMENTO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_EQUIPAMENTO[s]}</option>)}
            </select>
          </Campo>
          <Campo label="Responsável" dica="Quem está com o equipamento agora, se estiver em uso.">
            <select
              className="sel" value={editando?.responsavel_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, responsavel_id: e.target.value }))}
            >
              <option value="">Sem responsável</option>
              {dados.perfis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Observação">
            <textarea
              className="txt" value={editando?.observacao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, observacao: e.target.value }))}
              placeholder="Estado, particularidade, o que for útil saber."
            />
          </Campo>
        </div>
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
    </>
  )
}
