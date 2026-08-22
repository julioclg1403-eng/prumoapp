/* ============================================================
   DASHBOARD (PREVISION) — dentro de Planejamento

   Tudo aqui vem direto do que a sincronização com a Prevision já
   traz (schedule_global_items + prevision_project_links.scurve) —
   não é um cálculo aproximado do Prumo, é o mesmo número que
   aparece na tela da Prevision. Se a obra não tem Prevision
   vinculada ainda, a tela mostra isso claramente em vez de inventar
   dado.
   ============================================================ */

import { useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, plural, progressoEsperado, previsionCurvaHoje, previsionProgressoMensal,
} from '../lib/dominio'
import { Icon, PageHeader, Vazio, Indicador } from '../components'
import { RankingBarras, CurvaSPrevision, ProgressoMensalPrevision } from '../components/charts'

export default function PlanejamentoDashboard() {
  const dados = useDados()
  const hoje = hojeISO()

  const link = dados.previsionProjectLinks?.[0]
  const scurve = link?.scurve
  const itens = dados.cronogramaGlobal || []

  const previsionHoje = useMemo(() => previsionCurvaHoje(scurve, hoje), [scurve, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Meta não vem da Prevision (a API não expõe esse percentual, ver
     conversa) — quem digita é a gente, uma vez por mês, olhando a
     tela deles. Casa pelo mês (AAAA-MM) com o que já foi salvo. */
  const metasPorMes = useMemo(() => {
    const mapa = {}
    for (const m of dados.metasMensais || []) mapa[String(m.mes).slice(0, 7)] = Number(m.percentual)
    return mapa
  }, [dados.metasMensais])
  const progressoMensal = useMemo(
    () => previsionProgressoMensal(scurve).map((m) => ({ ...m, meta: metasPorMes[m.mes] ?? null })),
    [scurve, metasPorMes],
  )
  const salvarMeta = async (mesISO, percentual) => {
    await dados.salvarMetaMensal(`${mesISO}-01`, percentual)
  }

  const vinculadas = itens.filter((i) => i.schedule_item_id).length

  /* O card de KPI mostra a Meta do mês atual (a mesma que foi
     digitada à mão no Progresso Mensal) — não um cálculo nosso. Se
     ainda não foi digitada esse mês, mostra "—" em vez de inventar. */
  const mesAtual = hoje.slice(0, 7)
  const metaDoMes = metasPorMes[mesAtual] ?? null

  /* Atrasadas: previsto (calculado pelas datas de início/fim que a
     Prevision já manda) menos o percentual que a Prevision reporta
     — mesma conta de progressoEsperado que o Mensal usa, só que em
     cima do dado bruto da Prevision, não da medição manual. */
  const maisAtrasadas = useMemo(() => {
    return itens
      .filter((i) => i.data_inicio && i.data_fim && i.percentual_prevision != null)
      .map((i) => {
        const esperado = progressoEsperado(i, hoje)
        const realizado = Number(i.percentual_prevision) || 0
        return { chave: i.id, rotulo: i.descricao, gap: esperado - realizado, realizado, esperado }
      })
      .filter((i) => i.gap > 5)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 15)
  }, [itens, hoje])

  if (!link) {
    return (
      <div className="page">
        <PageHeader titulo="Dashboard" sub="Direto da Prevision" />
        <div className="card-flat">
          <Vazio titulo="Sem Prevision vinculada" texto="Essa obra ainda não tem um projeto da Prevision associado." />
        </div>
      </div>
    )
  }

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Dashboard"
        sub={`Direto da Prevision${link.prevision_project_name ? ` · ${link.prevision_project_name}` : ''}${
          previsionHoje?.data ? ` · dados de ${formatarData(previsionHoje.data)}` : ''
        }`}
      />

      {link.ultimo_erro && (
        <div className="alert danger">A última sincronização deu erro: {link.ultimo_erro}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <Indicador rotulo="Base" valor={previsionHoje ? `${previsionHoje.base.toFixed(1)}%` : '—'} />
        <Indicador rotulo="Previsto" valor={previsionHoje ? `${previsionHoje.previsto.toFixed(1)}%` : '—'} />
        <Indicador
          rotulo="Realizado" valor={previsionHoje ? `${previsionHoje.realizado.toFixed(1)}%` : '—'}
          tom={previsionHoje && previsionHoje.realizado >= previsionHoje.previsto ? 'success' : 'danger'}
        />
        <Indicador rotulo="Atividades" valor={itens.length} />
        <Indicador rotulo="Meta do mês" valor={metaDoMes != null ? `${metaDoMes.toFixed(2)}%` : '—'} />
      </div>

      <div className="card-flat chart-panel stack-2">
        <div className="t-micro">Curva S — Base × Previsto × Realizado</div>
        <CurvaSPrevision scurve={scurve} />
      </div>

      <div className="card-flat chart-panel stack-2">
        <div className="t-micro">Progresso mensal — Base × Previsto × Realizado</div>
        <ProgressoMensalPrevision meses={progressoMensal} onSalvarMeta={salvarMeta} />
      </div>

      <div className="card-flat chart-panel stack-2">
        <div className="t-micro">Atividades mais atrasadas (previsto − realizado, Prevision)</div>
        <RankingBarras
          itens={maisAtrasadas.map((i) => ({
            chave: i.chave, rotulo: i.rotulo, valor: i.gap, contador: `${i.realizado.toFixed(0)}%`,
          }))}
          formatarValor={(v) => `${v.toFixed(0)} p.p.`}
          cor="var(--danger)"
          vazio="Nenhuma atividade com atraso relevante segundo a Prevision."
        />
      </div>

      {itens.length - vinculadas > 0 && (
        <div className="t-caption" style={{ color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="alerta" size={14} />
          {plural(itens.length - vinculadas, 'atividade da Prevision ainda não achou', 'atividades da Prevision ainda não acharam')} etapa
          correspondente no Mensal — confira em Planejamento → Global.
        </div>
      )}
    </div>
  )
}
