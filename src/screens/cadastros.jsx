/* ============================================================
   CADASTROS AUXILIARES
   Alimentam todos os outros módulos: empresas, colaboradores,
   locais, serviços e tipos de ocorrência.

   Regra do BRIEFING (seção 8, item 5): ARQUIVAR, nunca apagar.
   Um local já usado num diário de três meses atrás não pode
   sumir — senão o histórico fica com buraco. Item arquivado
   deixa de aparecer nas listas de escolha, e só isso.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista, ChipToggle } from '../components'

/* Um lugar só descrevendo cada cadastro. Acrescentar um cadastro
   novo é acrescentar uma entrada aqui, não uma tela nova. */
const TIPOS = {
  empresas: {
    rotulo: 'Empresas',
    singular: 'empresa',
    feminino: true,
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Empresa ou equipe' },
      {
        nome: 'tipo', rotulo: 'Tipo', tipoCampo: 'select',
        opcoes: [{ valor: 'propria', rotulo: 'Equipe própria' }, { valor: 'empreiteira', rotulo: 'Empreiteira' }],
      },
      { nome: 'escopo', rotulo: 'Escopo', placeholder: 'O que essa empresa executa' },
    ],
    sub: (item, dados) => // eslint-disable-line no-unused-vars
      [item.tipo === 'propria' ? 'Equipe própria' : 'Empreiteira', item.escopo].filter(Boolean).join(' · '),
  },
  colaboradores: {
    rotulo: 'Colaboradores',
    singular: 'colaborador',
    /* Time de obra: "ativo/inativo" é como o Julio pensa desligamento,
       não "arquivado" — mesmo mecanismo (campo `ativo`) dos outros
       cadastros, só o vocabulário na tela muda pra esse tipo. */
    statusPessoa: true,
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'funcao', rotulo: 'Função', placeholder: 'Pedreiro, servente, eletricista…' },
      { nome: 'company_id', rotulo: 'Empresa', tipoCampo: 'ref', ref: 'empresas', obrigatorio: true },
    ],
    sub: (item, dados) => [item.funcao, dados.nomeDe(dados.empresas, item.company_id)].filter(Boolean).join(' · '),
  },
  locais: {
    rotulo: 'Locais',
    singular: 'local',
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Torre 1 — 5º pavimento' }],
    sub: () => 'Pavimento, ambiente ou setor',
  },
  servicos: {
    rotulo: 'Serviços',
    singular: 'serviço',
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Alvenaria de vedação' }],
    sub: () => 'Usado como frente de serviço no diário',
  },
  tiposOcorrencia: {
    rotulo: 'Ocorrências',
    singular: 'tipo de ocorrência',
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Falta de material' }],
    sub: () => 'Categoria de imprevisto do diário',
  },
  disciplinasProjeto: {
    rotulo: 'Disciplinas',
    singular: 'disciplina',
    feminino: true,
    soAdmin: true,
    campos: [
      { nome: 'sigla', rotulo: 'Sigla', placeholder: 'EST' },
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Estrutura' },
    ],
    sub: (item) => item.sigla || 'Usada nos apontamentos de Projetos',
  },
  categoriasProjeto: {
    rotulo: 'Categorias de apontamento',
    singular: 'categoria',
    feminino: true,
    soAdmin: true,
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Decisões da obra' }],
    sub: () => 'Usada nos apontamentos de Projetos',
  },
  etapasProjeto: {
    rotulo: 'Etapas de projeto',
    singular: 'etapa',
    feminino: true,
    soAdmin: true,
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Projeto executivo' }],
    sub: () => 'Fase em que o apontamento nasceu',
  },
  statusDisciplinaProjeto: {
    rotulo: 'Status das disciplinas',
    singular: 'status',
    soAdmin: true,
    campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Aguardando resposta' }],
    sub: () => 'Andamento de cada disciplina dentro do apontamento',
  },
}

export default function Cadastros({ voltar, perfil, params = {} }) {
  const dados = useDados()
  /* Os cadastros de Projetos (soAdmin) só aparecem pra quem é admin —
     módulo admin-only, o banco também recusa a leitura pros outros. */
  const TIPOS_VISIVEIS = Object.fromEntries(
    Object.entries(TIPOS).filter(([, d]) => !d.soAdmin || perfil?.role === 'admin'),
  )
  const [tipo, setTipo] = useState(
    params.tipo && TIPOS_VISIVEIS[params.tipo] ? params.tipo : 'empresas',
  )
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)

  /* O banco só deixa a gestão ALTERAR e ARQUIVAR cadastro — e uma
     gravação barrada pela permissão não dá erro, simplesmente não
     acontece. Deixar o botão à mostra para o campo seria oferecer
     um clique que não faz nada. Criar, ele pode: é o cadastro
     provisório, que a gestão confere depois. */
  const podeEditar = perfil?.role !== 'campo'

  const def = TIPOS[tipo]
  const todos = dados[tipo] || []
  const ativos = todos.filter((x) => x.ativo !== false).length
  const arquivados = todos.filter((x) => x.ativo === false).length
  const lista = todos.filter((x) => (mostrarArquivados ? x.ativo === false : x.ativo !== false))

  const abrirNovo = () => setEditando({})

  const salvar = async () => {
    const faltando = def.campos.filter((c) => c.obrigatorio && !String(editando?.[c.nome] || '').trim())
    if (faltando.length) return
    setSalvando(true)
    const ok = await dados.salvarCadastro(tipo, { ...editando })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const rotuloArquivar = def.statusPessoa ? 'Inativar' : 'Arquivar'
  const rotuloReativar = def.statusPessoa ? 'Ativar' : 'Reativar'
  const rotuloArquivado = def.statusPessoa ? 'Inativo' : 'Arquivado'
  const rotuloArquivados = def.statusPessoa ? 'Inativos' : 'Arquivados'

  const pedirArquivar = (item) => {
    const arquivando = item.ativo !== false
    setConfirmar({
      titulo: arquivando ? `${rotuloArquivar} ${def.singular}?` : `${rotuloReativar} ${def.singular}?`,
      texto: arquivando
        ? `«${item.nome}» deixa de aparecer nas listas de escolha, mas continua nos registros antigos. Nada é apagado.`
        : `«${item.nome}» volta a aparecer nas listas de escolha.`,
      rotuloOk: arquivando ? rotuloArquivar : rotuloReativar,
      perigo: arquivando,
      onOk: async () => { setConfirmar(null); await dados.arquivarCadastro(tipo, item.id) },
    })
  }

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Cadastros</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
        <button onClick={abrirNovo} aria-label={`Nov${def.feminino ? 'a' : 'o'} ${def.singular}`}><Icon name="mais_sinal" size={22} /></button>
      </div>

      <div className="page">
        <PageHeader
          titulo="Cadastros"
          sub="Alimentam o diário, o efetivo e as pendências"
          acao={
            <button className="btn btn-primary" onClick={abrirNovo}>
              <Icon name="mais_sinal" size={18} /> Novo
            </button>
          }
        />

        <div className="stack-2">
          {!podeEditar && (
            <div className="alert info">
              Você pode <strong>cadastrar</strong> aqui, e o que criar entra como provisório para a
              gestão conferir. Editar e arquivar cadastro existente é com ela.
            </div>
          )}

          <Segmentos
            valor={tipo}
            onChange={(t) => { setTipo(t); setMostrarArquivados(false) }}
            opcoes={Object.entries(TIPOS_VISIVEIS).map(([chave, d]) => ({
              valor: chave, rotulo: d.rotulo,
              contador: (dados[chave] || []).filter((x) => x.ativo !== false).length,
            }))}
          />

          {arquivados > 0 && (
            <Segmentos
              valor={mostrarArquivados ? 'arquivados' : 'ativos'}
              onChange={(v) => setMostrarArquivados(v === 'arquivados')}
              opcoes={[
                { valor: 'ativos', rotulo: 'Ativos', contador: ativos },
                { valor: 'arquivados', rotulo: rotuloArquivados, contador: arquivados },
              ]}
            />
          )}

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo={mostrarArquivados ? `Nenhum ${rotuloArquivado.toLowerCase()}` : `Nenhum${def.feminino ? 'a' : ''} ${def.singular} cadastrad${def.feminino ? 'a' : 'o'}`}
                texto={
                  mostrarArquivados
                    ? `Nenhum${def.feminino ? 'a' : ''} ${def.singular} foi ${def.statusPessoa ? 'inativad' : 'arquivad'}${def.feminino ? 'a' : 'o'} ainda.`
                    : `Cadastre ${def.feminino ? 'a primeira' : 'o primeiro'} ${def.singular} para começar a usar.`
                }
                acao={!mostrarArquivados && <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar</button>}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((item) => (
                <ItemLista
                  key={item.id}
                  titulo={item.nome}
                  sub={def.sub(item, dados)}
                  direita={
                    <div className="row-flex" style={{ gap: 4 }}>
                      {item.provisorio && !item.revisado && <Chip tom="info">Provisório</Chip>}
                      {item.ativo === false && <Chip>{rotuloArquivado}</Chip>}
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
                            aria-label={item.ativo === false ? rotuloReativar : rotuloArquivar}
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
        titulo={`${editando?.id ? 'Editar' : `Nov${def.feminino ? 'a' : 'o'}`} ${def.singular}`}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || def.campos.some((c) => c.obrigatorio && !String(editando?.[c.nome] || '').trim())}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          {def.campos.map((c, i) => (
            <Campo key={c.nome} label={c.rotulo}>
              {c.tipoCampo === 'select' ? (
                <select
                  className="sel" value={editando?.[c.nome] || c.opcoes[0].valor}
                  onChange={(e) => setEditando((x) => ({ ...x, [c.nome]: e.target.value }))}
                >
                  {c.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              ) : c.tipoCampo === 'ref' ? (
                <select
                  className="sel" value={editando?.[c.nome] || ''}
                  onChange={(e) => setEditando((x) => ({ ...x, [c.nome]: e.target.value }))}
                >
                  <option value="">Escolha</option>
                  {(dados[c.ref] || []).filter((r) => r.ativo !== false).map((r) => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="ipt" autoFocus={i === 0} value={editando?.[c.nome] || ''}
                  placeholder={c.placeholder}
                  onChange={(e) => setEditando((x) => ({ ...x, [c.nome]: e.target.value }))}
                />
              )}
            </Campo>
          ))}

          {def.statusPessoa && (
            <Campo label="Situação" dica="Inativo some das listas de escolha (diário, planejamento…), mas o histórico dele continua intacto.">
              <Segmentos
                valor={editando?.ativo === false ? 'inativo' : 'ativo'}
                onChange={(v) => setEditando((x) => ({ ...x, ativo: v !== 'inativo' }))}
                opcoes={[
                  { valor: 'ativo', rotulo: 'Ativo' },
                  { valor: 'inativo', rotulo: 'Inativo' },
                ]}
              />
            </Campo>
          )}

          {tipo === 'servicos' && (
            <Campo
              label="Etapas do cronograma"
              dica={
                editando?.id
                  ? 'Liga este serviço às etapas que ele compõe — é dali que sai a data real de execução de cada etapa, direto do que o diário registrar.'
                  : 'Salve o serviço primeiro; depois abra editar de novo pra ligar às etapas do cronograma.'
              }
            >
              {editando?.id ? (
                <div className="row-wrap">
                  {dados.cronograma.map((etapa) => (
                    <ChipToggle
                      key={etapa.id}
                      ativo={dados.servicosCronograma.some(
                        (v) => v.service_id === editando.id && v.schedule_item_id === etapa.id,
                      )}
                      onClick={() => dados.alternarVinculoServicoEtapa(editando.id, etapa.id)}
                    >
                      {etapa.descricao}
                    </ChipToggle>
                  ))}
                  {dados.cronograma.length === 0 && <div className="t-caption">Nenhuma etapa cadastrada no cronograma ainda.</div>}
                </div>
              ) : (
                <div className="t-caption">—</div>
              )}
            </Campo>
          )}
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
