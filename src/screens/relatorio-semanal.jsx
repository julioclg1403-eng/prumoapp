/* ============================================================
   RELATÓRIO SEMANAL — tela da Obra Modelo (versão de venda).
   Mostra o relatório no layout do ObraZap, com a marca do Prumo, e
   salva em PDF pelo diálogo de impressão do navegador.
   ============================================================ */

import { useMemo, useRef, useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, somarDias } from '../lib/dominio'
import { montarRelatorioSemanal } from '../lib/relatorioSemanal'
import { Icon } from '../components'

export default function RelatorioSemanal({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [de, setDe] = useState(somarDias(hoje, -6))
  const [ate, setAte] = useState(hoje)
  const quadro = useRef(null)

  const html = useMemo(() => montarRelatorioSemanal({
    obra: dados.obra, org: dados.org, de, ate,
    diarios: dados.diarios, planejamento: dados.planejamento,
    servicos: dados.servicos, locais: dados.locais, empresas: dados.empresas,
    tiposOcorrencia: dados.tiposOcorrencia, pendencias: dados.pendencias,
    responsavel: perfil?.nome,
  }), [dados, de, ate, perfil])

  const imprimir = () => {
    const w = quadro.current?.contentWindow
    if (!w) return
    w.focus()
    w.print()
  }

  const atalho = (rotulo, a, b) => (
    <button className="btn btn-secondary" onClick={() => { setDe(a); setAte(b) }}>{rotulo}</button>
  )

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Relatório semanal</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
        <button className="btn btn-primary" onClick={imprimir}>
          <Icon name="relatorio" size={18} /> Salvar em PDF
        </button>
      </div>

      <div className="page stack-2">
        <div className="card-flat">
          <div className="row-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
            {atalho('Últimos 7 dias', somarDias(hoje, -6), hoje)}
            {atalho('Últimos 14 dias', somarDias(hoje, -13), hoje)}
            {atalho('Últimos 30 dias', somarDias(hoje, -29), hoje)}
            <label className="t-caption">De <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
            <label className="t-caption">Até <input type="date" value={ate} min={de} max={hoje} onChange={(e) => setAte(e.target.value)} /></label>
          </div>
        </div>

        <iframe
          ref={quadro}
          title="Relatório semanal de obra"
          srcDoc={html}
          style={{ width: '100%', height: 1180, border: '1px solid var(--border, #d4d4d8)', borderRadius: 8, background: '#fff' }}
        />
      </div>
    </>
  )
}
