/* ============================================================
   CADASTROS AUXILIARES
   Alimentam todos os outros módulos: empresas, colaboradores,
   locais, serviços e tipos de ocorrência.

   Regra do BRIEFING (seção 8, item 5): ARQUIVAR, nunca apagar.
   Um local já usado num diário de três meses atrás não pode
   sumir — senão o histórico fica com buraco. Item arquivado
   deixa de aparecer nas listas de escolha, e só isso.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { normalizarParaCasar, moduloPermitido } from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista, ChipToggle,
  Selecionavel,
} from '../components'

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
  tiposTreinamento: {
    rotulo: 'Tipos de treinamento',
    singular: 'tipo de treinamento',
    campos: [
      { nome: 'sigla', rotulo: 'Sigla', placeholder: 'NR-35' },
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Trabalho em Altura' },
      { nome: 'validade_meses', rotulo: 'Validade (meses)', tipoCampo: 'numero', placeholder: 'Vazio = não vence' },
    ],
    sub: (item) => (item.validade_meses
      ? `${item.sigla ? `${item.sigla} · ` : ''}validade de ${item.validade_meses} meses`
      : (item.sigla || 'Sem vencimento cadastrado')),
  },
}

export default function Cadastros({ voltar, perfil, params = {} }) {
  const dados = useDados()
  /* Os cadastros de Projetos (soAdmin) só aparecem pra quem tem o
     módulo Projetos liberado — mesma regra de moduloPermitido que o
     resto do app, banco (RLS `tem_modulo`) concordando. */
  const TIPOS_VISIVEIS = Object.fromEntries(
    Object.entries(TIPOS).filter(([, d]) => !d.soAdmin || moduloPermitido(perfil, 'projetos')),
  )
  const [tipo, setTipo] = useState(
    params.tipo && TIPOS_VISIVEIS[params.tipo] ? params.tipo : 'empresas',
  )
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [importando, setImportando] = useState(false)
  const [agrupamento, setAgrupamento] = useState('nome')

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

  /* Só faz sentido pra colaborador — os outros cadastros não têm
     função nem empresa nessa tela. Colaborador sem o dado do grupo
     (função em branco, ou um cadastro antigo sem empresa) vai pro
     fim, num grupo à parte, em vez de sumir ou quebrar a ordenação.
     Por função agrupa pelo texto normalizado (sem acento/caixa)
     porque o cadastro real tem a mesma função digitada de jeitos
     diferentes — "Pedreiro" e "PEDREIRO" são o mesmo grupo, com o
     rótulo da primeira grafia encontrada. Por empresa agrupa pelo
     vínculo de verdade (company_id), não pelo texto. */
  const grupos = useMemo(() => {
    if (tipo !== 'colaboradores' || agrupamento === 'nome') return null
    const grupos = new Map()
    lista.forEach((item) => {
      let chave, rotuloSemDado, rotulo
      if (agrupamento === 'funcao') {
        const funcao = (item.funcao || '').trim()
        chave = funcao ? normalizarParaCasar(funcao) : ''
        rotuloSemDado = 'Sem função'
        rotulo = funcao || rotuloSemDado
      } else {
        chave = item.company_id || ''
        rotuloSemDado = 'Sem empresa'
        rotulo = item.company_id ? dados.nomeDe(dados.empresas, item.company_id) : rotuloSemDado
      }
      if (!grupos.has(chave)) grupos.set(chave, { rotulo, rotuloSemDado, itens: [] })
      grupos.get(chave).itens.push(item)
    })
    return Array.from(grupos.values()).sort((a, b) => {
      if (a.rotulo === a.rotuloSemDado) return 1
      if (b.rotulo === b.rotuloSemDado) return -1
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR')
    })
  }, [tipo, agrupamento, lista, dados])

  const abrirNovo = () => setEditando({})

  const salvar = async () => {
    const faltando = def.campos.filter((c) => c.obrigatorio && !String(editando?.[c.nome] || '').trim())
    if (faltando.length) return
    setSalvando(true)
    const payload = { ...editando }
    def.campos.filter((c) => c.tipoCampo === 'numero').forEach((c) => {
      payload[c.nome] = payload[c.nome] === '' || payload[c.nome] == null ? null : Number(payload[c.nome])
    })
    const ok = await dados.salvarCadastro(tipo, payload)
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

  const ItemDoCadastro = ({ item }) => (
    <ItemLista
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
  )

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
            <div className="row-flex" style={{ flexWrap: 'wrap' }}>
              {podeEditar && dados.obras.length > 1 && (
                <button className="btn btn-secondary" onClick={() => setImportando(true)}>
                  <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar de outra obra
                </button>
              )}
              <button className="btn btn-primary" onClick={abrirNovo}>
                <Icon name="mais_sinal" size={18} /> Novo
              </button>
            </div>
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

          {tipo === 'colaboradores' && (
            <Segmentos
              valor={agrupamento}
              onChange={setAgrupamento}
              opcoes={[
                { valor: 'nome', rotulo: 'Por nome' },
                { valor: 'funcao', rotulo: 'Por função' },
                { valor: 'empresa', rotulo: 'Por empresa' },
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
          ) : grupos ? (
            <div className="stack-3">
              {grupos.map(({ rotulo, itens }) => (
                <div key={rotulo} className="stack-1">
                  <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {rotulo} <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>{itens.length}</span>
                  </div>
                  {itens.map((item) => <ItemDoCadastro key={item.id} item={item} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((item) => <ItemDoCadastro key={item.id} item={item} />)}
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
              ) : c.tipoCampo === 'numero' ? (
                <input
                  className="ipt" type="number" inputMode="numeric" min="0" step="1" autoFocus={i === 0}
                  value={editando?.[c.nome] ?? ''} placeholder={c.placeholder}
                  onChange={(e) => setEditando((x) => ({ ...x, [c.nome]: e.target.value }))}
                />
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

      <ImportarDeOutraObra
        aberto={importando}
        onFechar={() => setImportando(false)}
        dados={dados}
        tipo={tipo}
        def={def}
      />
    </>
  )
}

/* ── Importar de outra obra ───────────────────────────────
   Não busca nada novo no banco: `tudo` (dominio interno do
   DadosContext) já carrega o cadastro de toda a organização, então
   "outra obra" é só olhar o mesmo dado com outro worksite_id
   (dados.cadastroDeOutraObra). Item cujo nome já bate com algo já
   cadastrado nesta obra fica travado pra não duplicar. Campo do tipo
   "ref" (hoje só colaborador → empresa) resolve pelo nome: acha a
   empresa já cadastrada aqui com o mesmo nome, ou cria uma nova —
   nunca aponta pra empresa que pertence só à obra de origem. */
function ImportarDeOutraObra({ aberto, onFechar, dados, tipo, def }) {
  const outrasObras = dados.obras.filter((o) => o.id !== dados.obra.id)
  const [obraOrigemId, setObraOrigemId] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [resultado, setResultado] = useState('')

  const fechar = () => {
    setObraOrigemId(''); setSelecionados(new Set()); setResultado(''); onFechar()
  }

  const existentesNormalizados = useMemo(
    () => new Set((dados[tipo] || []).map((x) => normalizarParaCasar(x.nome))),
    [dados, tipo],
  )

  const itensOrigem = useMemo(
    () => (obraOrigemId ? dados.cadastroDeOutraObra(tipo, obraOrigemId) : []),
    [dados, tipo, obraOrigemId],
  )

  /* def.sub() espera um `dados` com as listas de referência (ex.:
     colaborador → empresa) da MESMA obra do item. Sem isso, o nome
     da empresa da obra de origem nunca bate com `dados.empresas`
     (que é desta obra) e a linha mostra "—" à toa. */
  const dadosOrigem = useMemo(() => {
    if (!obraOrigemId) return dados
    const refs = {}
    def.campos.filter((c) => c.tipoCampo === 'ref').forEach((c) => {
      refs[c.ref] = dados.cadastroDeOutraObra(c.ref, obraOrigemId)
    })
    return { ...dados, ...refs }
  }, [dados, def, obraOrigemId])

  const disponiveis = itensOrigem.filter((item) => !existentesNormalizados.has(normalizarParaCasar(item.nome)))
  const jaExistemCount = itensOrigem.length - disponiveis.length

  const alternar = (id) => {
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  const confirmarImportacao = async () => {
    setImportandoAgora(true)
    /* Cache local do que já existe (ou acabou de ser criado) em cada
       cadastro-referência desta obra, pra dois itens que citam a
       mesma empresa nova não criarem ela duas vezes no mesmo lote —
       `dados` só atualiza no próximo render, não durante este loop. */
    const cacheRefs = {}
    def.campos.filter((c) => c.tipoCampo === 'ref').forEach((c) => {
      cacheRefs[c.ref] = {}
      ;(dados[c.ref] || []).forEach((r) => { cacheRefs[c.ref][normalizarParaCasar(r.nome)] = r.id })
    })

    let criados = 0
    for (const item of itensOrigem.filter((i) => selecionados.has(i.id))) {
      const novoItem = {}
      def.campos.forEach((c) => {
        if (c.tipoCampo !== 'ref') novoItem[c.nome] = item[c.nome] ?? ''
      })
      for (const c of def.campos.filter((cc) => cc.tipoCampo === 'ref')) {
        const valorOrigem = item[c.nome]
        if (!valorOrigem) { novoItem[c.nome] = ''; continue }
        const refOrigem = dados.cadastroDeOutraObra(c.ref, obraOrigemId).find((r) => r.id === valorOrigem)
        if (!refOrigem) { novoItem[c.nome] = ''; continue }
        const chave = normalizarParaCasar(refOrigem.nome)
        if (cacheRefs[c.ref][chave]) {
          novoItem[c.nome] = cacheRefs[c.ref][chave]
        } else {
          const criadoRef = await dados.salvarCadastro(c.ref, { nome: refOrigem.nome })
          if (criadoRef) { cacheRefs[c.ref][chave] = criadoRef.id; novoItem[c.nome] = criadoRef.id }
        }
      }
      const salvo = await dados.salvarCadastro(tipo, novoItem)
      if (salvo) criados += 1
    }
    setImportandoAgora(false)
    setResultado(`${criados} de ${selecionados.size} importado${criados === 1 ? '' : 's'}.`)
    setSelecionados(new Set())
  }

  return (
    <Sheet aberto={aberto} titulo={`Importar ${def.rotulo.toLowerCase()} de outra obra`} onFechar={fechar}>
      <div className="stack-2">
        <Campo label="Obra de origem">
          <select
            className="sel" value={obraOrigemId}
            onChange={(e) => { setObraOrigemId(e.target.value); setSelecionados(new Set()); setResultado('') }}
          >
            <option value="">Escolha a obra</option>
            {outrasObras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Campo>

        {resultado && <div className="alert success">{resultado}</div>}

        {obraOrigemId && !resultado && (
          itensOrigem.length === 0 ? (
            <div className="t-caption">Essa obra não tem nenhum{def.feminino ? 'a' : ''} {def.singular} ativ{def.feminino ? 'a' : 'o'} cadastrad{def.feminino ? 'a' : 'o'}.</div>
          ) : (
            <>
              <div className="row-between" style={{ alignItems: 'center' }}>
                <div className="t-caption">
                  {disponiveis.length} pra importar
                  {jaExistemCount > 0 && ` · ${jaExistemCount} já ${jaExistemCount === 1 ? 'existe' : 'existem'} nesta obra`}
                </div>
                {disponiveis.length > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelecionados(new Set(
                      selecionados.size === disponiveis.length ? [] : disponiveis.map((i) => i.id),
                    ))}
                  >
                    {selecionados.size === disponiveis.length ? 'Limpar seleção' : 'Selecionar todos'}
                  </button>
                )}
              </div>

              <div className="stack-1">
                {itensOrigem.map((item) => {
                  const jaExiste = existentesNormalizados.has(normalizarParaCasar(item.nome))
                  return (
                    <Selecionavel
                      key={item.id}
                      marcado={selecionados.has(item.id)}
                      onToggle={() => !jaExiste && alternar(item.id)}
                      titulo={item.nome}
                      sub={jaExiste ? 'Já existe nesta obra' : def.sub(item, dadosOrigem)}
                      direita={jaExiste ? <Chip>Já existe</Chip> : null}
                    />
                  )
                })}
              </div>
            </>
          )
        )}
      </div>

      {obraOrigemId && !resultado && itensOrigem.length > 0 && (
        <div className="row-flex" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary grow" onClick={fechar}>Cancelar</button>
          <button
            className="btn btn-primary grow" onClick={confirmarImportacao}
            disabled={importandoAgora || selecionados.size === 0}
          >
            {importandoAgora ? 'Importando…' : `Importar ${selecionados.size || ''}`}
          </button>
        </div>
      )}
      {resultado && (
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={fechar}>Fechar</button>
      )}
    </Sheet>
  )
}
