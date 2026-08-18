/* ============================================================
   SEGURANÇA DO TRABALHO
   Dois registros diferentes, na mesma tela:
   - Ocorrência: o que aconteceu (quase acidente ou acidente), sem
     precisar necessariamente apontar uma pessoa. Qualquer um da
     obra registra e edita; apagar é só a gestão.
   - Advertência: medida disciplinar sobre UM colaborador. O campo
     pode registrar na hora (é quem está lá quando acontece), mas
     corrigir ou apagar depois é só a gestão — de propósito, mais
     protegido que a ocorrência, por ser um registro sobre pessoa.
   Não estava no BRIEFING original; entrou por pedido direto.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, plural,
  TIPOS_OCORRENCIA_SEGURANCA, ROTULO_OCORRENCIA_SEGURANCA,
  GRAVIDADES, ROTULO_GRAVIDADE, TOM_GRAVIDADE,
  TIPOS_ADVERTENCIA, ROTULO_ADVERTENCIA,
  ROTULO_STATUS_TREINAMENTO, TOM_STATUS_TREINAMENTO, statusTreinamento, calcularVencimentoTreinamento,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista, TextareaComAudio,
  CampoFotos, VisorFoto, useLinksDeFotos,
  RelatorioFolha, SecaoRelatorio, FotosRelatorio,
} from '../components'
import SegurancaEpi from './seguranca-epi'

/* Uma linha rótulo/valor no aviso impresso. */
function LinhaRelatorio({ rotulo, valor }) {
  if (!valor) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{rotulo}</div>
      <div style={{ fontSize: 14, marginTop: 2, lineHeight: 1.5 }}>{valor}</div>
    </div>
  )
}

export default function Seguranca({ voltar, perfil, params = {} }) {
  const dados = useDados()
  const [aba, setAba] = useState('ocorrencias')

  /* Chegada por QR Code (useAbrirQrMaterial): a tela já existe na
     pilha quando isto muda, então o React não remonta o componente —
     precisa deste efeito pra pular direto pra sub-aba EPI. */
  useEffect(() => {
    if (params.abrirEpiMaterialId) setAba('epi')
  }, [params.abrirEpiMaterialId])

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Segurança</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader titulo="Segurança do trabalho" sub="Ocorrências, advertências, treinamentos e estoque de EPI da obra" />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'ocorrencias', rotulo: 'Ocorrências', contador: dados.ocorrenciasSeguranca.length },
              { valor: 'advertencias', rotulo: 'Advertências', contador: dados.advertencias.length },
              { valor: 'treinamentos', rotulo: 'Treinamentos NR', contador: dados.colaboradores.filter((c) => c.ativo !== false).length },
              { valor: 'epi', rotulo: 'Estoque EPI', contador: (dados.materiaisEpi || []).filter((m) => m.ativo !== false).length },
            ]}
          />
          {aba === 'ocorrencias' && <Ocorrencias dados={dados} perfil={perfil} />}
          {aba === 'advertencias' && <Advertencias dados={dados} perfil={perfil} />}
          {aba === 'treinamentos' && <Treinamentos dados={dados} perfil={perfil} />}
          {aba === 'epi' && <SegurancaEpi perfil={perfil} params={params} />}
        </div>
      </div>
    </>
  )
}

/* ── Ocorrências ─────────────────────────────────────────── */

function Ocorrencias({ dados, perfil }) {
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(0)
  const [fotoAberta, setFotoAberta] = useState(null)
  const [imprimindo, setImprimindo] = useState(null)

  const podeExcluir = perfil?.role !== 'campo'

  const links = useLinksDeFotos(editando?.fotos)
  const linksImprimir = useLinksDeFotos(imprimindo?.fotos)

  useEffect(() => {
    if (!imprimindo) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [imprimindo])

  const lista = useMemo(
    () => [...dados.ocorrenciasSeguranca].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.ocorrenciasSeguranca],
  )

  const abrirNova = () => setEditando({
    data: hojeISO(), titulo: '', tipo: 'quase_acidente', gravidade: 'leve',
    location_id: '', worker_id: '', descricao: '', acao_tomada: '', fotos: [],
  })

  const salvar = async () => {
    if (!editando?.titulo?.trim() || !editando?.data) return
    setSalvando(true)
    const ok = await dados.salvarOcorrenciaSeguranca({
      ...editando,
      titulo: editando.titulo.trim(),
      location_id: editando.location_id || null,
      worker_id: editando.worker_id || null,
      descricao: (editando.descricao || '').trim() || null,
      acao_tomada: (editando.acao_tomada || '').trim() || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  /* Mesma saída do diário e das pendências: sem id no banco ainda,
     a foto não tem onde se pendurar. Salva primeiro, na hora. */
  const garantirSalvo = async () => {
    if (editando.id) return editando
    if (!editando.titulo?.trim() || !editando.data) return null
    const salva = await dados.salvarOcorrenciaSeguranca({
      ...editando,
      titulo: editando.titulo.trim(),
      location_id: editando.location_id || null,
      worker_id: editando.worker_id || null,
    })
    if (salva) setEditando(salva)
    return salva
  }

  const enviarFotosOcorrencia = async (arquivos) => {
    setEnviandoFoto((n) => n + arquivos.length)
    try {
      const base = await garantirSalvo()
      if (!base) return
      const novas = []
      for (const arquivo of arquivos) {
        const f = await dados.adicionarFotoOcorrencia(base.id, arquivo)
        if (f) novas.push(f)
      }
      if (novas.length) setEditando((p) => ({ ...p, fotos: [...(p.fotos || []), ...novas] }))
    } finally {
      setEnviandoFoto((n) => Math.max(0, n - arquivos.length))
    }
  }

  const removerFotoOcorrencia = async (foto) => {
    const ok = await dados.removerFotoOcorrencia(foto)
    if (ok) setEditando((p) => ({ ...p, fotos: (p.fotos || []).filter((f) => f.id !== foto.id) }))
  }

  const pedirExcluir = (item) => {
    setConfirmar({
      titulo: 'Excluir ocorrência?',
      texto: `«${item.titulo}» some para sempre. Isso não pode ser desfeito.`,
      rotuloOk: 'Excluir', perigo: true,
      onOk: async () => { setConfirmar(null); await dados.excluirOcorrenciaSeguranca(item.id) },
    })
  }

  return (
    <>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={abrirNova}>
        <Icon name="mais_sinal" size={18} /> Nova ocorrência
      </button>

      {lista.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma ocorrência"
            texto="Registre quase acidentes e acidentes assim que acontecerem."
            acao={<button className="btn btn-primary" onClick={abrirNova}>Registrar</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {lista.map((o) => (
            <div key={o.id} className="card-flat">
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 15 }}>{o.titulo}</div>
                  {o.descricao && <div className="t-caption" style={{ marginTop: 4, lineHeight: 1.5 }}>{o.descricao}</div>}
                  <div className="row-wrap" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                    <Chip tom={TOM_GRAVIDADE[o.gravidade]}>{ROTULO_GRAVIDADE[o.gravidade]}</Chip>
                    <span className="t-caption">{ROTULO_OCORRENCIA_SEGURANCA[o.tipo]}</span>
                    <span className="t-caption">· {formatarData(o.data)}</span>
                    {o.worker_id && <span className="t-caption">· {dados.nomeDe(dados.colaboradores, o.worker_id)}</span>}
                    {o.location_id && <span className="t-caption">· {dados.nomeDe(dados.locais, o.location_id)}</span>}
                  </div>
                  {o.acao_tomada && (
                    <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>
                      <strong>Ação tomada:</strong> {o.acao_tomada}
                    </div>
                  )}
                  {o.fotos?.length > 0 && (
                    <div className="t-caption" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="camera" size={13} /> {o.fotos.length === 1 ? '1 foto' : `${o.fotos.length} fotos`}
                    </div>
                  )}
                </div>
                <div className="row-flex" style={{ gap: 2 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setImprimindo(o)} aria-label="Imprimir">
                    <Icon name="relatorio" size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditando({ ...o })} aria-label="Editar">
                    <Icon name="editar" size={16} />
                  </button>
                  {podeExcluir && (
                    <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluir(o)} aria-label="Excluir">
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar ocorrência' : 'Nova ocorrência'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.titulo?.trim() || !editando?.data}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="O que aconteceu">
            <input
              className="ipt" autoFocus value={editando?.titulo || ''}
              onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Uma frase curta e específica"
            />
          </Campo>
          <div className="row-flex" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={editando?.data || ''}
                  onChange={(e) => setEditando((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <div style={{ width: 150 }}>
              <Campo label="Tipo">
                <select
                  className="sel" value={editando?.tipo || 'quase_acidente'}
                  onChange={(e) => setEditando((p) => ({ ...p, tipo: e.target.value }))}
                >
                  {TIPOS_OCORRENCIA_SEGURANCA.map((t) => <option key={t} value={t}>{ROTULO_OCORRENCIA_SEGURANCA[t]}</option>)}
                </select>
              </Campo>
            </div>
            <div style={{ width: 130 }}>
              <Campo label="Gravidade">
                <select
                  className="sel" value={editando?.gravidade || 'leve'}
                  onChange={(e) => setEditando((p) => ({ ...p, gravidade: e.target.value }))}
                >
                  {GRAVIDADES.map((g) => <option key={g} value={g}>{ROTULO_GRAVIDADE[g]}</option>)}
                </select>
              </Campo>
            </div>
          </div>
          <Campo label="Local" dica="Opcional">
            <select
              className="sel" value={editando?.location_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, location_id: e.target.value }))}
            >
              <option value="">Sem local específico</option>
              {dados.locais.filter((l) => l.ativo !== false).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Colaborador envolvido" dica="Opcional">
            <select
              className="sel" value={editando?.worker_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, worker_id: e.target.value }))}
            >
              <option value="">Sem colaborador específico</option>
              {dados.colaboradores.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Detalhe">
            <TextareaComAudio
              value={editando?.descricao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="O que aconteceu, com contexto suficiente."
            />
          </Campo>
          <Campo label="Ação tomada" dica="O que foi feito a respeito.">
            <TextareaComAudio
              value={editando?.acao_tomada || ''}
              onChange={(e) => setEditando((p) => ({ ...p, acao_tomada: e.target.value }))}
              placeholder="Ex.: interditada a área, reforçada a sinalização…"
            />
          </Campo>
          <Campo label="Fotos">
            <CampoFotos
              fotos={editando?.fotos || []}
              links={links}
              enviando={enviandoFoto}
              onAdicionar={enviarFotosOcorrencia}
              onRemover={removerFotoOcorrencia}
              onAbrir={setFotoAberta}
            />
          </Campo>
        </div>
      </Sheet>

      <VisorFoto
        foto={fotoAberta}
        fotos={editando?.fotos || []}
        links={links}
        onFechar={() => setFotoAberta(null)}
        onIr={(delta) => {
          const lista2 = editando?.fotos || []
          const i = lista2.findIndex((f) => f.id === fotoAberta.id)
          const prox = lista2[(i + delta + lista2.length) % lista2.length]
          if (prox) setFotoAberta(prox)
        }}
      />

      {imprimindo && (
        <RelatorioFolha
          titulo="Ocorrência de segurança"
          sub={`${ROTULO_OCORRENCIA_SEGURANCA[imprimindo.tipo]} · ${ROTULO_GRAVIDADE[imprimindo.gravidade]}`}
          obra={dados.obra.nome} org={dados.org.nome}
        >
          <SecaoRelatorio>
            <LinhaRelatorio rotulo="O que aconteceu" valor={imprimindo.titulo} />
            <LinhaRelatorio rotulo="Data" valor={formatarData(imprimindo.data)} />
            <LinhaRelatorio
              rotulo="Local"
              valor={imprimindo.location_id ? dados.nomeDe(dados.locais, imprimindo.location_id) : null}
            />
            <LinhaRelatorio
              rotulo="Colaborador envolvido"
              valor={imprimindo.worker_id ? dados.nomeDe(dados.colaboradores, imprimindo.worker_id) : null}
            />
            <LinhaRelatorio rotulo="Detalhe" valor={imprimindo.descricao} />
            <LinhaRelatorio rotulo="Ação tomada" valor={imprimindo.acao_tomada} />
          </SecaoRelatorio>
          <FotosRelatorio fotos={imprimindo.fotos || []} links={linksImprimir} />
        </RelatorioFolha>
      )}

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

/* ── Advertências ────────────────────────────────────────── */

function Advertencias({ dados, perfil }) {
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(0)
  const [fotoAberta, setFotoAberta] = useState(null)
  const [imprimindo, setImprimindo] = useState(null)

  /* Registrar todo mundo pode -- é o campo aplicando na hora. Editar
     ou apagar depois de criada é só a gestão (política do banco);
     esconder aqui evita oferecer um clique que seria recusado. */
  const podeGerenciar = perfil?.role !== 'campo'

  const links = useLinksDeFotos(editando?.fotos)
  const linksImprimir = useLinksDeFotos(imprimindo?.fotos)

  useEffect(() => {
    if (!imprimindo) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [imprimindo])

  const lista = useMemo(
    () => [...dados.advertencias].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.advertencias],
  )

  const abrirNova = () => setEditando({
    data: hojeISO(), worker_id: '', tipo: 'verbal', motivo: '', descricao: '', aplicada_por: perfil.id, fotos: [],
  })

  const salvar = async () => {
    if (!editando?.worker_id || !editando?.motivo?.trim() || !editando?.data) return
    setSalvando(true)
    const ok = await dados.salvarAdvertencia({
      ...editando,
      motivo: editando.motivo.trim(),
      descricao: (editando.descricao || '').trim() || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const garantirSalvo = async () => {
    if (editando.id) return editando
    if (!editando.worker_id || !editando.motivo?.trim() || !editando.data) return null
    const salva = await dados.salvarAdvertencia({ ...editando, motivo: editando.motivo.trim() })
    if (salva) setEditando(salva)
    return salva
  }

  const enviarFotosAdvertencia = async (arquivos) => {
    setEnviandoFoto((n) => n + arquivos.length)
    try {
      const base = await garantirSalvo()
      if (!base) return
      const novas = []
      for (const arquivo of arquivos) {
        const f = await dados.adicionarFotoAdvertencia(base.id, arquivo)
        if (f) novas.push(f)
      }
      if (novas.length) setEditando((p) => ({ ...p, fotos: [...(p.fotos || []), ...novas] }))
    } finally {
      setEnviandoFoto((n) => Math.max(0, n - arquivos.length))
    }
  }

  const removerFotoAdvertencia = async (foto) => {
    const ok = await dados.removerFotoAdvertencia(foto)
    if (ok) setEditando((p) => ({ ...p, fotos: (p.fotos || []).filter((f) => f.id !== foto.id) }))
  }

  const pedirExcluir = (item) => {
    setConfirmar({
      titulo: 'Excluir advertência?',
      texto: 'Esse registro some para sempre. Isso não pode ser desfeito.',
      rotuloOk: 'Excluir', perigo: true,
      onOk: async () => { setConfirmar(null); await dados.excluirAdvertencia(item.id) },
    })
  }

  return (
    <>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={abrirNova}>
        <Icon name="mais_sinal" size={18} /> Nova advertência
      </button>

      {lista.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma advertência"
            texto="Registre aqui quando aplicar uma advertência verbal ou escrita."
            acao={<button className="btn btn-primary" onClick={abrirNova}>Registrar</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {lista.map((a) => (
            <ItemLista
              key={a.id}
              titulo={dados.nomeDe(dados.colaboradores, a.worker_id)}
              sub={`${a.motivo} · ${formatarData(a.data)}${a.fotos?.length ? ` · ${a.fotos.length === 1 ? '1 foto' : `${a.fotos.length} fotos`}` : ''}`}
              direita={
                <div className="row-flex" style={{ gap: 4 }}>
                  <Chip tom={a.tipo === 'escrita' ? 'danger' : ''}>{ROTULO_ADVERTENCIA[a.tipo]}</Chip>
                  <button className="btn btn-ghost btn-sm" onClick={() => setImprimindo(a)} aria-label="Imprimir">
                    <Icon name="relatorio" size={16} />
                  </button>
                  {podeGerenciar && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditando({ ...a })} aria-label="Editar">
                        <Icon name="editar" size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluir(a)} aria-label="Excluir">
                        <Icon name="x" size={16} />
                      </button>
                    </>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar advertência' : 'Nova advertência'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.worker_id || !editando?.motivo?.trim() || !editando?.data}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Colaborador">
            <select
              className="sel" value={editando?.worker_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, worker_id: e.target.value }))}
            >
              <option value="">Escolha</option>
              {dados.colaboradores.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <div className="row-flex" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={editando?.data || ''}
                  onChange={(e) => setEditando((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <div style={{ width: 130 }}>
              <Campo label="Tipo">
                <select
                  className="sel" value={editando?.tipo || 'verbal'}
                  onChange={(e) => setEditando((p) => ({ ...p, tipo: e.target.value }))}
                >
                  {TIPOS_ADVERTENCIA.map((t) => <option key={t} value={t}>{ROTULO_ADVERTENCIA[t]}</option>)}
                </select>
              </Campo>
            </div>
          </div>
          <Campo label="Motivo">
            <input
              className="ipt" value={editando?.motivo || ''}
              onChange={(e) => setEditando((p) => ({ ...p, motivo: e.target.value }))}
              placeholder="Uma frase curta e específica"
            />
          </Campo>
          <Campo label="Detalhe" dica="Opcional">
            <TextareaComAudio
              value={editando?.descricao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Contexto adicional, se precisar."
            />
          </Campo>
          <Campo label="Fotos">
            <CampoFotos
              fotos={editando?.fotos || []}
              links={links}
              enviando={enviandoFoto}
              onAdicionar={enviarFotosAdvertencia}
              onRemover={removerFotoAdvertencia}
              onAbrir={setFotoAberta}
            />
          </Campo>
        </div>
      </Sheet>

      <VisorFoto
        foto={fotoAberta}
        fotos={editando?.fotos || []}
        links={links}
        onFechar={() => setFotoAberta(null)}
        onIr={(delta) => {
          const lista2 = editando?.fotos || []
          const i = lista2.findIndex((f) => f.id === fotoAberta.id)
          const prox = lista2[(i + delta + lista2.length) % lista2.length]
          if (prox) setFotoAberta(prox)
        }}
      />

      {imprimindo && (
        <RelatorioFolha
          titulo="Advertência"
          sub={ROTULO_ADVERTENCIA[imprimindo.tipo]}
          obra={dados.obra.nome} org={dados.org.nome}
        >
          <SecaoRelatorio>
            <LinhaRelatorio rotulo="Colaborador" valor={dados.nomeDe(dados.colaboradores, imprimindo.worker_id)} />
            <LinhaRelatorio rotulo="Data" valor={formatarData(imprimindo.data)} />
            <LinhaRelatorio rotulo="Tipo" valor={ROTULO_ADVERTENCIA[imprimindo.tipo]} />
            <LinhaRelatorio rotulo="Motivo" valor={imprimindo.motivo} />
            <LinhaRelatorio rotulo="Detalhe" valor={imprimindo.descricao} />
            <LinhaRelatorio rotulo="Aplicada por" valor={dados.nomeDe(dados.perfis, imprimindo.aplicada_por)} />
          </SecaoRelatorio>
          <FotosRelatorio fotos={imprimindo.fotos || []} links={linksImprimir} />
          <div style={{ marginTop: 36, fontSize: 12, lineHeight: 1.6 }}>
            Declaro estar ciente do teor desta advertência.
            <div style={{ display: 'flex', gap: 40, marginTop: 34 }}>
              <div style={{ flex: 1, borderTop: '1px solid #18181B', paddingTop: 4 }}>Assinatura do colaborador</div>
              <div style={{ width: 140, borderTop: '1px solid #18181B', paddingTop: 4 }}>Data</div>
            </div>
          </div>
        </RelatorioFolha>
      )}

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

/* ── Treinamentos NR ─────────────────────────────────────────
   Inspirado num app de terceiro (WebSST) que o Julio mandou pro
   Paulo Victor no Instagram: por colaborador, o status de cada
   treinamento NR exigido (Válido/A vencer/Vencido/Pendente), com
   data de realização e vencimento calculado (tipo × validade em
   meses — ver dominio.js). Cada registro é histórico: renovar cria
   uma linha nova, não sobrescreve a anterior. */

const PRIORIDADE_STATUS_TREINAMENTO = { vencido: 0, a_vencer: 1, pendente: 2, valido: 3 }

function ultimoTreinamento(treinamentos, workerId, tipoId) {
  const doPar = treinamentos.filter((t) => t.worker_id === workerId && t.training_type_id === tipoId)
  if (doPar.length === 0) return null
  return [...doPar].sort((a, b) => (a.data_realizacao < b.data_realizacao ? 1 : -1))[0]
}

function Treinamentos({ dados, perfil }) {
  const [colaboradorAberto, setColaboradorAberto] = useState(null)
  const [registrandoTipo, setRegistrandoTipo] = useState(null)
  const [novoRegistro, setNovoRegistro] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const podeExcluir = perfil?.role !== 'campo'

  const tipos = useMemo(
    () => (dados.tiposTreinamento || []).filter((t) => t.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.tiposTreinamento],
  )
  const colaboradoresAtivos = useMemo(
    () => dados.colaboradores.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.colaboradores],
  )
  const treinamentos = dados.treinamentosColaboradores || []

  const resumoPorColaborador = useMemo(() => colaboradoresAtivos.map((c) => {
    const linhas = tipos.map((t) => {
      const ultimo = ultimoTreinamento(treinamentos, c.id, t.id)
      return ultimo ? statusTreinamento(ultimo.data_vencimento) : 'pendente'
    })
    const pior = linhas.reduce((acc, s) => (PRIORIDADE_STATUS_TREINAMENTO[s] < PRIORIDADE_STATUS_TREINAMENTO[acc] ? s : acc), 'valido')
    return {
      colaborador: c, pior,
      vencidos: linhas.filter((s) => s === 'vencido').length,
      aVencer: linhas.filter((s) => s === 'a_vencer').length,
    }
  }), [colaboradoresAtivos, tipos, treinamentos])

  const totais = useMemo(() => resumoPorColaborador.reduce((acc, r) => ({
    vencidos: acc.vencidos + r.vencidos, aVencer: acc.aVencer + r.aVencer,
  }), { vencidos: 0, aVencer: 0 }), [resumoPorColaborador])

  const fecharTudo = () => { setColaboradorAberto(null); setRegistrandoTipo(null); setNovoRegistro(null) }

  const abrirRegistro = (tipo) => {
    setRegistrandoTipo(tipo)
    setNovoRegistro({ worker_id: colaboradorAberto.id, training_type_id: tipo.id, data_realizacao: hojeISO(), observacao: '' })
  }

  const salvarRegistro = async () => {
    if (!novoRegistro?.data_realizacao) return
    setSalvando(true)
    const ok = await dados.salvarTreinamentoColaborador(novoRegistro)
    setSalvando(false)
    if (ok) { setRegistrandoTipo(null); setNovoRegistro(null) }
  }

  const pedirExcluirRegistro = (registro, tipo) => {
    setConfirmar({
      titulo: 'Excluir este registro?',
      texto: `O último «${tipo.nome}» de ${colaboradorAberto.nome} some do histórico. Isso não tem volta.`,
      rotuloOk: 'Excluir', perigo: true,
      onOk: async () => { setConfirmar(null); await dados.excluirTreinamentoColaborador(registro.id) },
    })
  }

  if (tipos.length === 0) {
    return (
      <div className="card-flat">
        <Vazio
          titulo="Nenhum tipo de treinamento cadastrado"
          texto="Cadastre os NRs exigidos (ex.: NR-35, NR-06, NR-10…) em Cadastros → Tipos de treinamento."
        />
      </div>
    )
  }

  return (
    <>
      {(totais.vencidos > 0 || totais.aVencer > 0) && (
        <div className="row-wrap" style={{ gap: 8, marginBottom: 10 }}>
          {totais.vencidos > 0 && <Chip tom="danger">{plural(totais.vencidos, 'treinamento vencido', 'treinamentos vencidos')}</Chip>}
          {totais.aVencer > 0 && <Chip tom="info">{plural(totais.aVencer, 'a vencer nos próximos 30 dias', 'a vencer nos próximos 30 dias')}</Chip>}
        </div>
      )}

      {colaboradoresAtivos.length === 0 ? (
        <div className="card-flat">
          <Vazio titulo="Nenhum colaborador" texto="Cadastre colaboradores para acompanhar os treinamentos deles." />
        </div>
      ) : (
        <div className="stack-1">
          {resumoPorColaborador.map((r) => (
            <ItemLista
              key={r.colaborador.id}
              titulo={r.colaborador.nome}
              sub={r.colaborador.funcao || ''}
              aviso={r.pior === 'vencido'}
              onClick={() => setColaboradorAberto(r.colaborador)}
              direita={<Chip tom={TOM_STATUS_TREINAMENTO[r.pior]}>{ROTULO_STATUS_TREINAMENTO[r.pior]}</Chip>}
            />
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(colaboradorAberto)}
        titulo={registrandoTipo ? (registrandoTipo.sigla || registrandoTipo.nome) : colaboradorAberto?.nome}
        onFechar={fecharTudo}
        rodape={registrandoTipo && (
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => { setRegistrandoTipo(null); setNovoRegistro(null) }}>Voltar</button>
            <button
              className="btn btn-primary grow" onClick={salvarRegistro}
              disabled={salvando || !novoRegistro?.data_realizacao}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )}
      >
        {colaboradorAberto && (
          registrandoTipo ? (
            <div className="stack-2">
              <Campo label="Data de realização">
                <input
                  className="ipt" type="date" autoFocus value={novoRegistro?.data_realizacao || ''}
                  onChange={(e) => setNovoRegistro((p) => ({ ...p, data_realizacao: e.target.value }))}
                />
              </Campo>
              {registrandoTipo.validade_meses ? (
                <div className="t-caption">
                  Vence em {formatarData(calcularVencimentoTreinamento(novoRegistro?.data_realizacao, registrandoTipo.validade_meses))}
                  {' '}(validade de {plural(registrandoTipo.validade_meses, 'mês', 'meses')})
                </div>
              ) : (
                <div className="t-caption">Este treinamento não tem vencimento cadastrado.</div>
              )}
              <Campo label="Observação" dica="Opcional">
                <input
                  className="ipt" value={novoRegistro?.observacao || ''}
                  onChange={(e) => setNovoRegistro((p) => ({ ...p, observacao: e.target.value }))}
                  placeholder="Instrutor, empresa que aplicou…"
                />
              </Campo>
            </div>
          ) : (
            <div className="stack-1">
              {tipos.map((t) => {
                const ultimo = ultimoTreinamento(treinamentos, colaboradorAberto.id, t.id)
                const status = ultimo ? statusTreinamento(ultimo.data_vencimento) : 'pendente'
                return (
                  <div key={t.id} className="card-flat" style={{ padding: 10 }}>
                    <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="t-strong" style={{ fontSize: 14 }}>{t.sigla ? `${t.sigla} — ${t.nome}` : t.nome}</div>
                        {ultimo ? (
                          <div className="t-caption" style={{ marginTop: 4 }}>
                            Realizado em {formatarData(ultimo.data_realizacao)}
                            {ultimo.data_vencimento && ` · vence em ${formatarData(ultimo.data_vencimento)}`}
                          </div>
                        ) : (
                          <div className="t-caption" style={{ marginTop: 4 }}>Nunca realizado</div>
                        )}
                      </div>
                      <Chip tom={TOM_STATUS_TREINAMENTO[status]}>{ROTULO_STATUS_TREINAMENTO[status]}</Chip>
                    </div>
                    <div className="row-flex" style={{ marginTop: 8, gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => abrirRegistro(t)}>
                        {ultimo ? 'Renovar' : 'Registrar'}
                      </button>
                      {ultimo && podeExcluir && (
                        <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluirRegistro(ultimo, t)}>
                          Excluir último registro
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
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
    </>
  )
}
