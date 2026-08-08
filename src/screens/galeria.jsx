/* ============================================================
   GALERIA
   Reúne as fotos de todos os diários da obra.

   Os filtros usam as MESMAS listas de cadastro das outras telas
   (locais, serviços, colaboradores), e o recorte por obra já veio
   pronto do DadosContext. Nenhum filtro é reimplementado aqui —
   é o que garante que a galeria e o diário nunca discordem sobre
   o que existe.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, somarDias, formatarData, formatarDataCurta, plural } from '../lib/dominio'
import { formatarTamanho } from '../lib/fotos'
import {
  Icon, PageHeader, Segmentos, Vazio, Miniatura, VisorFoto, useLinksDeFotos, Confirmar,
  BotaoRelatorio, RelatorioFolha, SecaoRelatorio, FotosRelatorio,
} from '../components'

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 90, rotulo: '90 dias' },
  { valor: 0, rotulo: 'Tudo' },
]

export default function Galeria({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()

  const [periodo, setPeriodo] = useState(30)
  const [localId, setLocalId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [autorId, setAutorId] = useState('')
  const [aberta, setAberta] = useState(null)
  const [apagando, setApagando] = useState(null)

  /* Cada foto ganha o serviço e o local da frente a que pertence.
     A foto do dia não tem frente — fica com o nome da obra. */
  const comContexto = useMemo(() => {
    return dados.fotosDaObra.map((f) => {
      const ativ = f.activity_id
        ? (f.report.atividades || []).find((a) => a.id === f.activity_id)
        : null
      const r = ativ ? dados.rotuloAtividade(ativ.planned_id) : null
      return {
        ...f,
        servicoId: r?.planejada?.service_id || null,
        localId: r?.planejada?.location_id || null,
        servico: r?.servico || (f.principal ? 'Foto do dia' : 'Sem frente'),
        local: r?.local || dados.obra.nome,
      }
    })
  }, [dados.fotosDaObra, dados.rotuloAtividade, dados.obra.nome])

  const lista = useMemo(() => {
    const limite = periodo ? somarDias(hoje, -periodo + 1) : null
    return comContexto.filter((f) =>
      (!limite || f.data >= limite) &&
      (!localId || f.localId === localId) &&
      (!servicoId || f.servicoId === servicoId) &&
      (!autorId || f.autor_id === autorId),
    )
  }, [comContexto, periodo, localId, servicoId, autorId, hoje])

  const links = useLinksDeFotos(lista)

  /* Agrupa por dia: é assim que quem procura uma foto pensa
     ("aquela da semana passada"), não por ordem corrida. */
  const porDia = useMemo(() => {
    const mapa = new Map()
    lista.forEach((f) => {
      if (!mapa.has(f.data)) mapa.set(f.data, [])
      mapa.get(f.data).push(f)
    })
    return [...mapa.entries()]
  }, [lista])

  const filtroAtivo = localId || servicoId || autorId
  const limparFiltros = () => { setLocalId(''); setServicoId(''); setAutorId('') }

  const subRelatorio = [
    PERIODOS.find((p) => p.valor === periodo)?.rotulo,
    localId && dados.nomeDe(dados.locais, localId),
    servicoId && dados.nomeDe(dados.servicos, servicoId),
    autorId && dados.nomeDe(dados.perfis, autorId),
  ].filter(Boolean).join(' · ')

  const confirmarApagar = async () => {
    const ok = await dados.removerFoto(apagando)
    setApagando(null)
    if (ok && aberta?.id === apagando.id) setAberta(null)
  }

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Galeria</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
        <Icon name="galeria" size={22} />
      </div>

      <div className="page">
        <PageHeader
          titulo="Galeria"
          sub={`${plural(lista.length, 'foto', 'fotos')} no filtro atual`}
          acao={lista.length > 0 && <BotaoRelatorio />}
        />

        <div className="stack-2">
          <Segmentos opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <select className="sel" style={{ height: 38 }} value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Todos os locais</option>
              {dados.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <select className="sel" style={{ height: 38 }} value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
              <option value="">Todos os serviços</option>
              {dados.servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <select className="sel" style={{ height: 38 }} value={autorId} onChange={(e) => setAutorId(e.target.value)}>
              <option value="">Qualquer autor</option>
              {dados.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          {filtroAtivo && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={limparFiltros}>
              <Icon name="x" size={14} /> Limpar filtros
            </button>
          )}

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo={dados.fotosDaObra.length === 0 ? 'Nenhuma foto ainda' : 'Nada neste filtro'}
                texto={
                  dados.fotosDaObra.length === 0
                    ? 'As fotos tiradas dentro do diário aparecem aqui, organizadas por dia.'
                    : 'Aumente o período ou limpe os filtros.'
                }
              />
            </div>
          ) : (
            <div className="stack-3">
              {porDia.map(([data, fotosDoDia]) => (
                <div key={data}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <div className="t-micro">
                      {formatarData(data)}
                      {data === hoje && <span style={{ color: 'var(--primary)' }}> · hoje</span>}
                    </div>
                    <span className="t-caption">{plural(fotosDoDia.length, 'foto', 'fotos')}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
                    {fotosDoDia.map((f) => (
                      <div key={f.id}>
                        <Miniatura
                          src={links[f.caminho]}
                          legenda={f.legenda}
                          onClick={() => setAberta(f)}
                        />
                        <div className="t-caption truncate" style={{ marginTop: 4, fontSize: 11 }}>
                          {f.servico}
                        </div>
                        <div className="truncate" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          {f.local}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <VisorFoto
        foto={aberta}
        fotos={lista}
        links={links}
        onFechar={() => setAberta(null)}
        onIr={(passo) => {
          const i = lista.findIndex((f) => f.id === aberta.id)
          const proxima = lista[(i + passo + lista.length) % lista.length]
          if (proxima) setAberta(proxima)
        }}
        extra={
          <button
            onClick={() => setApagando(aberta)} aria-label="Apagar foto"
            style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                     width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={18} />
          </button>
        }
      />

      {aberta && (
        <div
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81,
                   background: 'rgba(0,0,0,0.75)', color: 'rgba(255,255,255,0.85)',
                   padding: '10px 16px', fontSize: 12, lineHeight: 1.5,
                   paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          {aberta.servico} · {aberta.local} · {formatarDataCurta(aberta.data)}
          {' · '}
          {dados.perfilPorId(aberta.autor_id)?.nome || 'autor desconhecido'}
          {aberta.largura ? ` · ${aberta.largura}×${aberta.altura}` : ''}
          {aberta.tamanho_bytes ? ` · ${formatarTamanho(aberta.tamanho_bytes)}` : ''}
        </div>
      )}

      <Confirmar
        aberto={Boolean(apagando)}
        titulo="Apagar esta foto?"
        texto="A imagem sai do armazenamento e some do diário. Isso não tem volta."
        rotuloOk="Apagar" perigo
        onOk={confirmarApagar}
        onCancelar={() => setApagando(null)}
      />

      <RelatorioFolha
        titulo="Galeria de fotos" sub={subRelatorio}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        {porDia.map(([data, fotosDoDia]) => (
          <SecaoRelatorio key={data} titulo={formatarData(data)}>
            <FotosRelatorio
              fotos={fotosDoDia} links={links}
              legenda={(f) => `${f.servico} · ${f.local}`}
            />
          </SecaoRelatorio>
        ))}
      </RelatorioFolha>
    </>
  )
}
