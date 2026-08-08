/* ============================================================
   PEÇAS REUTILIZÁVEIS — usadas por todas as telas.
   Se um mesmo elemento aparece em duas telas, ele mora aqui.
   ============================================================ */

import { useEffect, useState } from 'react'

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
    <div className="row-between" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
      <div className="grow">
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

/* ── Linha selecionável (presenças, equipes) ─────────────── */

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
