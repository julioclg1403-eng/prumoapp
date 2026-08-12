/* ============================================================
   PEÇAS REUTILIZÁVEIS — usadas por todas as telas.
   Se um mesmo elemento aparece em duas telas, ele mora aqui.
   ============================================================ */

import { useEffect, useState, useRef, useCallback } from 'react'
import { linksTemporarios, baixarFoto } from '../lib/fotos'
import { linksTemporariosAnexos } from '../lib/anexos'
import { transcrever } from '../lib/audio'
import { gradeDoMes, somarMeses, rotuloMes } from '../lib/dominio'

/* ── Ícones (SVG na mão, sem biblioteca) ─────────────────── */

const CAMINHOS = {
  inicio: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  diario: 'M4 4.5h11a2.5 2.5 0 0 1 2.5 2.5v13H6.5A2.5 2.5 0 0 1 4 17.5zM17.5 7H20v13H6.5M8 9h6M8 13h6',
  efetivo: 'M8.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M2.5 19.5c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2M16 5.2a3 3 0 0 1 0 5.9M17.5 14.6c2.4.5 4 2.3 4 4.9',
  pendencias: 'M12 3.5 21 19.5H3zM12 9.5v4.5M12 16.8v.2',
  mais: 'M4 4.5h6v6H4zM14 4.5h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  planejamento: 'M4 5.5h16v15H4zM4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 17h3M14 13.5h2',
  cadastros: 'M4.5 6.5h15M4.5 12h15M4.5 17.5h15M2 6.5h.01M2 12h.01M2 17.5h.01',
  usuarios: 'M12 11.5a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4M4.5 20.5c0-3.6 3.3-6 7.5-6s7.5 2.4 7.5 6',
  mais_sinal: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  sair: 'M15 12H4.5M8 8.5 4.5 12 8 15.5M11 4.5h7a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-7',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M16.2 16.2 21 21',
  editar: 'M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5.5 16.5zM14.5 6.5l3 3',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5.2l3.2 2',
  local: 'M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  alerta: 'M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6M12 7.8v5M12 15.8v.2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  obra: 'M3 20.5h18M5 20.5V9l7-4.5L19 9v11.5M10 20.5v-5h4v5',
  camera: 'M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  galeria: 'M3 5.5h18v13H3zM3 15l5-4.5 4 3.5 3.5-3L21 15M15.5 9.5h.01',
  baixar: 'M12 4v11M8 11.5l4 4 4-4M4.5 19.5h15',
  filtro: 'M4 6h16l-6.2 7v5.5l-3.6 1.8V13z',
  pedidos: 'M3 6.5h3l2 10h10l2-7.5H7M9.5 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M17 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  cronograma: 'M4 6h9M4 12h14M4 18h6',
  relatorio: 'M7 3.5h7l4 4v13H7zM14 3.5V8h4M9.5 12.5h5M9.5 15.5h5M9.5 18h3',
  lembrete: 'M12 3.2c-1 0-1.7.8-1.7 1.7v.5C7.8 6.1 6 8.6 6 11.5v3.3L4.3 18h15.4L18 14.8v-3.3c0-2.9-1.8-5.4-4.3-6.1v-.5c0-.9-.7-1.7-1.7-1.7zM9.7 18a2.3 2.3 0 0 0 4.6 0',
  equipamento: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  microfone: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6.5 10.5v1a5.5 5.5 0 0 0 11 0v-1M12 17.5v3M9 20.5h6',
  parar: 'M6.5 6.5h11v11h-11z',
  projeto: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  anexo: 'M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 5 5L9.41 17.02a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48',
  comentario: 'M21 11.5a8.4 8.4 0 0 1-8.4 8.4H12a8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.2a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3h.1a8.4 8.4 0 0 1 8.4 8.4z',
}

export function Icon({ name, size = 20, style }) {
  const dPath = CAMINHOS[name]
  if (!dPath) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', ...style }} aria-hidden="true"
    >
      <path d={dPath} />
    </svg>
  )
}

/* ── Detecta tela larga (sidebar) vs celular (barra inferior) ─ */

export function useDesktop(limite = 900) {
  const [desktop, setDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= limite : false,
  )
  useEffect(() => {
    const aoRedimensionar = () => setDesktop(window.innerWidth >= limite)
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [limite])
  return desktop
}

/* ── Cabeçalho grafite ───────────────────────────────────── */

export function Topbar({ titulo, sub, onVoltar, direita }) {
  return (
    <div className="topbar">
      {onVoltar && (
        <button onClick={onVoltar} aria-label="Voltar">
          <Icon name="voltar" size={22} />
        </button>
      )}
      <div className="grow">
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{titulo}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {direita}
    </div>
  )
}

export function PageHeader({ titulo, sub, acao }) {
  return (
    <div className="row-between" style={{ marginBottom: 16, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 10 }}>
      <div className="grow" style={{ minWidth: 180 }}>
        <h1 className="t-display">{titulo}</h1>
        {sub && <div className="t-caption" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {acao}
    </div>
  )
}

/* ── Chip de status ──────────────────────────────────────── */

export function Chip({ tom = '', children }) {
  return <span className={`chip ${tom}`}>{children}</span>
}

/* ── Alerta (borda lateral, sem fundo cheio) ─────────────── */

export function Alerta({ tom = '', children }) {
  return <div className={`alert ${tom}`}>{children}</div>
}

/* ── Folha deslizante / modal ────────────────────────────── */

export function Sheet({ aberto, titulo, onFechar, children, rodape }) {
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  if (!aberto) return null
  return (
    <div className="overlay" onClick={onFechar} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div className="t-title">{titulo}</div>
          <button className="btn btn-ghost btn-sm" onClick={onFechar} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
        {rodape && <div style={{ marginTop: 18 }}>{rodape}</div>}
      </div>
    </div>
  )
}

/* ── Confirmação antes de ação irreversível ──────────────── */

export function Confirmar({ aberto, titulo, texto, rotuloOk = 'Confirmar', perigo, onOk, onCancelar }) {
  return (
    <Sheet aberto={aberto} titulo={titulo} onFechar={onCancelar}>
      <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5 }}>{texto}</div>
      <div className="row-flex" style={{ marginTop: 20 }}>
        <button className="btn btn-secondary grow" onClick={onCancelar}>Cancelar</button>
        <button className={`btn grow ${perigo ? 'btn-danger' : 'btn-primary'}`} onClick={onOk}>
          {rotuloOk}
        </button>
      </div>
    </Sheet>
  )
}

/* ── Campo de formulário ─────────────────────────────────── */

export function Campo({ label, children, dica }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      {children}
      {dica && <div className="t-caption" style={{ marginTop: 4, fontSize: 12 }}>{dica}</div>}
    </div>
  )
}

/* ── Campo de texto com microfone ─────────────────────────
   Substituto de <textarea> em qualquer formulário do app: mesmas
   props, mais um botão de gravar que transcreve e ACRESCENTA ao
   que já estiver escrito (nunca troca — quem já tinha digitado
   algo não perde nada se gravar por cima).

   Três estados: parado → gravando → transcrevendo → parado. O
   pedido de permissão do microfone só acontece no primeiro toque,
   como qualquer app. */
export function TextareaComAudio({ value, onChange, style, ...props }) {
  const [estado, setEstado] = useState('parado') // parado | gravando | transcrevendo
  const [erro, setErro] = useState('')
  const gravadorRef = useRef(null)
  const pedacosRef = useRef([])

  const alternar = async () => {
    if (estado === 'gravando') {
      gravadorRef.current?.stop()
      return
    }
    if (estado !== 'parado') return

    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const gravador = new MediaRecorder(stream)
      pedacosRef.current = []
      gravador.ondataavailable = (e) => { if (e.data.size > 0) pedacosRef.current.push(e.data) }
      gravador.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setEstado('transcrevendo')
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || 'audio/webm' })
        const texto = await transcrever(blob)
        setEstado('parado')
        if (texto == null) { setErro('Não consegui transcrever. Tenta de novo.'); return }
        if (!texto.trim()) return
        const atual = value || ''
        onChange({ target: { value: atual ? `${atual}\n${texto.trim()}` : texto.trim() } })
      }
      gravadorRef.current = gravador
      gravador.start()
      setEstado('gravando')
    } catch {
      setErro('Não consegui acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea
          className="txt" value={value} onChange={onChange}
          style={{ paddingRight: props.disabled ? undefined : 46, ...style }} {...props}
        />
        {!props.disabled && (
          <button
            type="button" onClick={alternar} disabled={estado === 'transcrevendo'}
            aria-label={estado === 'gravando' ? 'Parar gravação' : 'Gravar áudio'}
            style={{
              position: 'absolute', top: 8, right: 8, width: 30, height: 30, border: 0, borderRadius: 999,
              background: estado === 'gravando' ? 'var(--danger)' : 'var(--surface-2)',
              color: estado === 'gravando' ? '#fff' : 'var(--text-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: estado === 'transcrevendo' ? 'default' : 'pointer',
            }}
          >
            <Icon name={estado === 'gravando' ? 'parar' : 'microfone'} size={16} />
          </button>
        )}
      </div>
      {estado === 'gravando' && <div className="t-caption" style={{ marginTop: 4 }}>Gravando… toque de novo para parar.</div>}
      {estado === 'transcrevendo' && <div className="t-caption" style={{ marginTop: 4 }}>Transcrevendo…</div>}
      {erro && <div className="t-caption" style={{ marginTop: 4, color: 'var(--danger)' }}>{erro}</div>}
    </div>
  )
}

/* ── Filtro em segmentos ─────────────────────────────────── */

export function Segmentos({ opcoes, valor, onChange }) {
  return (
    <div className="row-wrap">
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            className={`btn btn-sm ${ativo ? 'btn-dark' : 'btn-secondary'}`}
            onClick={() => onChange(o.valor)}
            aria-pressed={ativo}
          >
            {o.rotulo}
            {typeof o.contador === 'number' && (
              <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{o.contador}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── Estado vazio: sempre diz qual é o próximo passo ─────── */

export function Vazio({ titulo, texto, acao }) {
  return (
    <div className="empty">
      <div className="t">{titulo}</div>
      <div style={{ fontSize: 14, maxWidth: 340, margin: '0 auto' }}>{texto}</div>
      {acao && <div style={{ marginTop: 16 }}>{acao}</div>}
    </div>
  )
}

/* ── Seletor de obra ─────────────────────────────────────────
   Fica no cabeçalho porque a obra é o escopo de TUDO: trocar de
   obra troca o diário, o efetivo, as pendências e os cadastros.
   Com uma obra só, não aparece — seria um controle que não faz
   nada ocupando a área mais nobre da tela. */

export function SeletorObra({ obras, obraId, onTrocar, escuro }) {
  if (!obras || obras.length < 2) return null
  return (
    <select
      value={obraId || ''}
      onChange={(e) => onTrocar(e.target.value)}
      aria-label="Obra"
      style={{
        width: '100%', height: 34, padding: '0 8px', cursor: 'pointer',
        borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
        background: escuro ? 'var(--graphite-2)' : 'var(--surface)',
        color: escuro ? 'var(--on-graphite)' : 'var(--text)',
        border: `1px solid ${escuro ? 'var(--graphite-3)' : 'var(--border-strong)'}`,
      }}
    >
      {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  )
}

/* ── Aviso de falha ──────────────────────────────────────────
   Erro de banco não pode passar em branco: se a gravação não foi,
   a pessoa precisa saber ANTES de sair da tela achando que salvou. */

export function BarraErro({ mensagem }) {
  if (!mensagem) return null
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 90,
        maxWidth: 560, margin: '0 auto',
        background: 'var(--surface)', boxShadow: 'var(--shadow-pop)',
        borderLeft: '4px solid var(--danger)', color: 'var(--danger)',
        borderRadius: '0 var(--radius-btn) var(--radius-btn) 0',
        padding: '12px 14px', fontSize: 14, lineHeight: 1.45,
      }}
    >
      {mensagem}
    </div>
  )
}

/* ── Item de lista clicável ──────────────────────────────── */

export function ItemLista({ titulo, sub, direita, onClick, aviso }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={onClick ? 'card-tap' : 'card-flat'}
      onClick={onClick}
      style={aviso ? { borderLeft: '4px solid var(--danger)' } : undefined}
    >
      <div className="row-between">
        <div className="grow">
          <div className="t-strong" style={{ fontSize: 15 }}>{titulo}</div>
          {sub && <div className="t-caption" style={{ marginTop: 3 }}>{sub}</div>}
        </div>
        {direita}
      </div>
    </Tag>
  )
}

/* ── Cartão de número (indicadores) ──────────────────────── */

export function Indicador({ rotulo, valor, tom, onClick }) {
  const cor = tom === 'danger' ? 'var(--danger)' : tom === 'success' ? 'var(--success)'
    : tom === 'info' ? 'var(--info)' : 'var(--text)'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={onClick ? 'card-tap' : 'card-flat'}
      onClick={onClick}
      style={{ padding: 14, minWidth: 0 }}
    >
      <div className="t-micro" style={{ marginBottom: 6 }}>{rotulo}</div>
      <div className="t-num" style={{ fontSize: 26, fontWeight: 700, color: cor, lineHeight: 1 }}>{valor}</div>
    </Tag>
  )
}

/* ============================================================
   RELATÓRIO PARA IMPRESSÃO

   Cada tela renderiza sua folha junto com o resto (escondida por
   CSS — ver .relatorio no index.css) e populada com os MESMOS dados
   que já estão na tela, já filtrados. O botão só chama window.print():
   não existe "gerar" separado, porque não existe segunda consulta.
   ============================================================ */

export function BotaoRelatorio({ onClick }) {
  return (
    <button className="btn btn-secondary" onClick={onClick || (() => window.print())}>
      <Icon name="relatorio" size={17} /> Relatório
    </button>
  )
}

export function RelatorioFolha({ titulo, sub, obra, org, children }) {
  return (
    <div className="relatorio">
      <div className="relatorio-cabecalho">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Prumo<span style={{ color: '#EA6E1F' }}>.</span></div>
          <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{org} · {obra}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{sub}</div>}
          <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2 }}>
            Gerado em {new Date().toLocaleDateString('pt-BR')} às{' '}
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

export function SecaoRelatorio({ titulo, children }) {
  return (
    <div className="relatorio-secao">
      {titulo && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{titulo}</div>}
      {children}
    </div>
  )
}

export function FotosRelatorio({ fotos, links, legenda }) {
  if (!fotos.length) return null
  return (
    <div className="relatorio-fotos">
      {fotos.map((f) => (
        <div key={f.id} className="relatorio-foto">
          <img src={links[f.caminho]} alt="" />
          <div className="relatorio-foto-legenda">{legenda ? legenda(f) : (f.legenda || '')}</div>
        </div>
      ))}
    </div>
  )
}

export function TabelaRelatorio({ colunas, linhas }) {
  if (!linhas.length) {
    return <div style={{ fontSize: 12, color: '#71717A' }}>Nada neste filtro.</div>
  }
  return (
    <table className="tbl" style={{ width: '100%' }}>
      <thead><tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>{linha.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/* ============================================================
   FOTOS
   ============================================================ */

/* O balde é privado: não existe endereço fixo da imagem. Este gancho
   pede os links temporários em lote e os renova antes de expirarem,
   para a galeria não "apagar" na mão de quem está olhando. */
export function useLinksDeFotos(fotos) {
  const [links, setLinks] = useState({})
  const pedidos = useRef(new Set())

  const caminhos = (fotos || []).map((f) => f.caminho).join('|')

  /* CUIDADO ao mexer aqui. Este efeito NÃO cancela o pedido na
     limpeza, e isso é deliberado.

     O React monta, desmonta e remonta cada componente em
     desenvolvimento. Como o `pedidos` marca o caminho ANTES da
     resposta chegar, cancelar na limpeza produzia o pior dos
     mundos: a primeira rodada era descartada, a segunda achava que
     já havia pedido, e o link nunca chegava — a galeria contava as
     fotos certas e não mostrava nenhuma. Sem o cancelamento, a
     resposta da primeira rodada chega e vale. */
  useEffect(() => {
    const lista = [...new Set((fotos || []).map((f) => f.caminho).filter(Boolean))]
    const faltando = lista.filter((c) => !pedidos.current.has(c))
    if (faltando.length === 0) return

    faltando.forEach((c) => pedidos.current.add(c))
    linksTemporarios(faltando).then((novos) => {
      /* O que falhou sai da marcação, senão a foto ficaria presa em
         "carregando…" para sempre, sem nova tentativa. */
      faltando.forEach((c) => { if (!novos[c]) pedidos.current.delete(c) })
      setLinks((atual) => ({ ...atual, ...novos }))
    })
  }, [caminhos]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Os links valem 1 hora. Renovar a cada 50 minutos evita que a
     imagem some da tela de quem deixou o app aberto. */
  useEffect(() => {
    const lista = (fotos || []).map((f) => f.caminho).filter(Boolean)
    if (lista.length === 0) return
    const id = setInterval(() => {
      linksTemporarios(lista).then((novos) => setLinks((a) => ({ ...a, ...novos })))
    }, 50 * 60 * 1000)
    return () => clearInterval(id)
  }, [caminhos]) // eslint-disable-line react-hooks/exhaustive-deps

  return links
}

/* Miniatura quadrada. `contain` sobre fundo escuro em vez de `cover`
   porque foto de obra costuma ter o assunto na borda — cortar o
   centro esconderia justamente o que a pessoa quis registrar. */
export function Miniatura({ src, legenda, onClick, onRemover, enviando, erro }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--graphite)' }}>
      {src ? (
        <img
          src={src} alt={legenda || 'Foto da obra'}
          onClick={onClick}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: onClick ? 'zoom-in' : 'default' }}
        />
      ) : (
        <div
          className="row-flex"
          style={{ width: '100%', height: '100%', justifyContent: 'center', color: 'var(--on-graphite-2)', fontSize: 11 }}
        >
          {erro ? 'falhou' : enviando ? 'enviando…' : 'carregando…'}
        </div>
      )}

      {enviando && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>
          enviando…
        </div>
      )}

      {onRemover && !enviando && (
        <button
          onClick={onRemover} aria-label="Remover foto"
          style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, border: 0,
                   borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}

/* Grade de fotos + dois botões de adicionar. `capture="environment"`
   faz o celular abrir direto a câmera traseira — um toque a menos
   para quem está de capacete e luva. O segundo botão, sem `capture`,
   abre a galeria: para quem já tirou a foto antes e só quer anexar. */
export function CampoFotos({ fotos, links, onAdicionar, onRemover, onAbrir, bloqueado, enviando, rotulo = 'Adicionar foto' }) {
  const entradaCamera = useRef(null)
  const entradaGaleria = useRef(null)

  const escolher = (e) => {
    const arquivos = [...(e.target.files || [])]
    e.target.value = ''
    if (arquivos.length) onAdicionar(arquivos)
  }

  const BotaoAdicionar = ({ onClick, icone, texto }) => (
    <button
      onClick={onClick}
      style={{
        aspectRatio: '1', borderRadius: 10, cursor: 'pointer',
        border: '1px dashed var(--border-strong)', background: 'var(--surface-2)',
        color: 'var(--text-2)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600, padding: 4,
      }}
    >
      <Icon name={icone} size={22} />
      {texto}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
        {(fotos || []).map((f) => (
          <Miniatura
            key={f.id}
            src={links[f.caminho]}
            legenda={f.legenda}
            onClick={onAbrir ? () => onAbrir(f) : undefined}
            onRemover={bloqueado ? undefined : () => onRemover(f)}
          />
        ))}

        {enviando > 0 && Array.from({ length: enviando }).map((_, i) => (
          <Miniatura key={`enviando-${i}`} enviando />
        ))}

        {!bloqueado && (
          <>
            <BotaoAdicionar onClick={() => entradaCamera.current?.click()} icone="camera" texto={rotulo} />
            <BotaoAdicionar onClick={() => entradaGaleria.current?.click()} icone="galeria" texto="Da galeria" />
          </>
        )}
      </div>

      <input
        ref={entradaCamera} type="file" accept="image/*" capture="environment" multiple
        onChange={escolher} style={{ display: 'none' }}
      />
      <input
        ref={entradaGaleria} type="file" accept="image/*" multiple
        onChange={escolher} style={{ display: 'none' }}
      />
    </div>
  )
}

/* Visualização ampliada. Fundo preto e navegação por seta, porque
   quem abre uma foto quase sempre quer ver a seguinte também. */
export function VisorFoto({ foto, fotos, links, onFechar, onIr, extra }) {
  const aoTeclar = useCallback((e) => {
    if (e.key === 'Escape') onFechar()
    if (e.key === 'ArrowRight') onIr?.(1)
    if (e.key === 'ArrowLeft') onIr?.(-1)
  }, [onFechar, onIr])

  useEffect(() => {
    if (!foto) return
    window.addEventListener('keydown', aoTeclar)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = ''
    }
  }, [foto, aoTeclar])

  if (!foto) return null
  const posicao = fotos ? fotos.findIndex((f) => f.id === foto.id) + 1 : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.94)',
               display: 'flex', flexDirection: 'column' }}
      onClick={onFechar} role="dialog" aria-modal="true"
    >
      <div
        className="row-between"
        style={{ padding: '12px 14px', color: '#fff', flex: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
            {foto.legenda || 'Foto da obra'}
          </div>
          {posicao && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {posicao} de {fotos.length}
            </div>
          )}
        </div>
        <div className="row-flex" style={{ gap: 6 }}>
          {extra}
          <button
            onClick={() => baixarFoto(foto)} aria-label="Baixar"
            style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                     width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="baixar" size={18} />
          </button>
          <button
            onClick={onFechar} aria-label="Fechar"
            style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                     width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

      <div
        className="grow"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {onIr && fotos && fotos.length > 1 && (
          <button
            onClick={() => onIr(-1)} aria-label="Anterior"
            style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                     width: 40, height: 40, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="voltar" size={20} />
          </button>
        )}
        <img
          src={links[foto.caminho]} alt={foto.legenda || 'Foto da obra'}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', flex: 1 }}
        />
        {onIr && fotos && fotos.length > 1 && (
          <button
            onClick={() => onIr(1)} aria-label="Próxima"
            style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                     width: 40, height: 40, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="avancar" size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

/* Mesmo raciocínio do useLinksDeFotos, mas para o bucket `anexos`
   (PDF e imagem, sem compressão). */
export function useLinksDeAnexos(anexos) {
  const [links, setLinks] = useState({})
  const pedidos = useRef(new Set())
  const caminhos = (anexos || []).map((a) => a.caminho).join('|')

  useEffect(() => {
    const lista = [...new Set((anexos || []).map((a) => a.caminho).filter(Boolean))]
    const faltando = lista.filter((c) => !pedidos.current.has(c))
    if (faltando.length === 0) return
    faltando.forEach((c) => pedidos.current.add(c))
    linksTemporariosAnexos(faltando).then((novos) => {
      faltando.forEach((c) => { if (!novos[c]) pedidos.current.delete(c) })
      setLinks((atual) => ({ ...atual, ...novos }))
    })
  }, [caminhos]) // eslint-disable-line react-hooks/exhaustive-deps

  return links
}

/* Lista de anexos (PDF/imagem) + botão de adicionar. Ao contrário de
   CampoFotos, aqui não existe miniatura de câmera: quem anexa uma
   prancha ou nota técnica já tem o arquivo pronto no aparelho. */
export function CampoAnexos({ anexos, links, onAdicionar, onRemover, bloqueado, enviando, rotulo = 'Adicionar anexo' }) {
  const entrada = useRef(null)

  const escolher = (e) => {
    const arquivos = [...(e.target.files || [])]
    e.target.value = ''
    if (arquivos.length) onAdicionar(arquivos)
  }

  return (
    <div>
      <div className="stack-1">
        {(anexos || []).map((a) => (
          <div key={a.id} className="row-between" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
            <a
              href={links[a.caminho]} target="_blank" rel="noreferrer"
              className="row-flex" style={{ gap: 8, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
            >
              <Icon name="relatorio" size={18} style={{ flex: 'none', color: 'var(--text-2)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.nome_arquivo || 'Anexo'}
              </span>
            </a>
            {!bloqueado && onRemover && (
              <button
                onClick={() => onRemover(a)} aria-label="Remover anexo"
                className="btn btn-ghost btn-sm" style={{ flex: 'none', padding: 4 }}
              >
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        ))}

        {enviando > 0 && Array.from({ length: enviando }).map((_, i) => (
          <div key={`enviando-${i}`} className="row-flex t-caption" style={{ gap: 8, padding: '8px 10px' }}>
            <Icon name="relatorio" size={18} /> enviando…
          </div>
        ))}
      </div>

      {!bloqueado && (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => entrada.current?.click()}>
          <Icon name="anexo" size={16} /> {rotulo}
        </button>
      )}

      <input
        ref={entrada} type="file" accept="application/pdf,image/*" multiple
        onChange={escolher} style={{ display: 'none' }}
      />
    </div>
  )
}

/* ── Linha selecionável (presenças, equipes) ─────────────── */

/* Chip clicável, liga/desliga. Usado onde a escolha é "marque quantos
   fizerem sentido" (categorias, locais, módulos liberados) — mais
   compacto que uma lista de Selecionavel quando são poucas opções. */
export function ChipToggle({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="chip"
      style={{
        cursor: 'pointer', fontFamily: 'var(--font)',
        border: ativo ? '1.5px solid var(--primary)' : '1px solid var(--border-strong)',
        background: ativo ? 'var(--primary-tint)' : 'var(--surface-2)',
        color: ativo ? 'var(--primary-dark)' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  )
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/* Grade de mês, nascida na aba Diários e reaproveitada onde mais
   precisar de "veja o mês inteiro e o que aconteceu em cada dia"
   (ex.: dias realizados de uma etapa do Cronograma). `obterMarca(iso)`
   devolve `{ rotulo, tom }` pra pintar o dia, ou null pra deixar em
   branco — a tela dona dos dados decide o que conta como marca, este
   componente só desenha. */
export function CalendarioMes({ mes, onMudarMes, hoje, obterMarca, onClicarDia }) {
  const grade = gradeDoMes(mes)

  return (
    <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="row-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onMudarMes(hoje.slice(0, 7))}>Hoje</button>
        <div className="row-flex" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => onMudarMes(somarMeses(mes, -1))}>
            <Icon name="voltar" size={16} />
          </button>
          <div className="t-strong" style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }}>{rotuloMes(mes)}</div>
          <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => onMudarMes(somarMeses(mes, 1))}>
            <Icon name="avancar" size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {DIAS_SEMANA.map((n) => (
          <div key={n} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            <span className="calendario-dia-semana-curto">{n.slice(0, 3)}</span>
            <span className="calendario-dia-semana-longo">{n}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {grade.map((c) => {
          const marca = c.doMes ? obterMarca(c.iso) : null
          const ehHoje = c.iso === hoje
          const clicavel = c.doMes && Boolean(onClicarDia)
          return (
            <button
              key={c.iso}
              onClick={() => clicavel && onClicarDia(c.iso)}
              disabled={!clicavel}
              style={{
                aspectRatio: '1', minHeight: 64, border: '1px solid var(--border)', borderRight: 0, borderBottom: 0,
                background: 'var(--surface)', cursor: clicavel ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', alignItems: 'stretch', boxSizing: 'border-box',
                width: '100%', minWidth: 0,
                padding: 6, fontFamily: 'var(--font)', textAlign: 'left', position: 'relative',
              }}
            >
              <span
                style={{
                  fontSize: 13, fontWeight: ehHoje ? 700 : 500,
                  color: !c.doMes ? 'var(--text-3)' : ehHoje ? 'var(--primary)' : 'var(--text)',
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 999, border: ehHoje ? '1.5px solid var(--primary)' : 'none',
                }}
              >
                {c.dia}
              </span>
              <span className="grow" />
              {marca && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '3px 2px', borderRadius: 5,
                    color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', overflow: 'hidden',
                    background: marca.tom === 'success' ? 'var(--success)'
                      : marca.tom === 'danger' ? 'var(--danger)' : 'var(--info)',
                  }}
                >
                  <span className="calendario-dia-semana-curto">✓</span>
                  <span className="calendario-dia-semana-longo">{marca.rotulo}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Selecionavel({ marcado, onToggle, titulo, sub, direita }) {
  return (
    <button className="pick" data-on={marcado ? '1' : '0'} onClick={onToggle} aria-pressed={marcado}>
      <span className="box"><Icon name="check" size={14} /></span>
      <span className="grow" style={{ textAlign: 'left' }}>
        <span className="t-strong" style={{ display: 'block', fontSize: 15 }}>{titulo}</span>
        {sub && <span className="t-caption" style={{ display: 'block', marginTop: 2 }}>{sub}</span>}
      </span>
      {direita}
    </button>
  )
}
