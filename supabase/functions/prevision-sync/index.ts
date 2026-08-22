// ============================================================
// PREVISION SYNC — puxa o cronograma físico (entidade "Activity" da
// Prevision, a mesma que alimenta a aba "Activities" da planilha que
// o setor de planejamento baixava na mão) e espelha no Global do
// Prumo, chamando a mesma lógica de import da planilha manual
// (importar_cronograma_global_service — cópia de
// importar_cronograma_global sem a checagem de usuário logado,
// porque quem chama aqui é o agendador, não uma pessoa).
//
// Mapeamento (confirmado contra dados reais das duas obras antes de
// subir isso — ver conversa): codigo_externo = Activity.id (é
// literalmente o mesmo número que já está em schedule_global_items
// hoje, tipo "44299446"); descricao = Activity.service.name;
// datas previstas = startAt/endAt; "real" não existe como campo
// direto na API, então é derivado de percentageCompleted do jeito
// que a própria Prevision já faz na exportação da planilha: 100% =
// real igual ao previsto, >0% = só início real, 0%/null = nada.
//
// percentual_prevision guarda o percentageCompleted cru, e a RPC
// espelha esse valor direto em schedule_items.percentual pras etapas
// do Mensal já vinculadas por nome — decisão do Julio, já que a
// planilha manual também vem da Prevision. Etapa sem vínculo
// continua só por medição manual (ver conversa).
//
// Não tem usuário logado chamando isso (é o pg_cron), então a
// autenticação é um segredo próprio (x-cron-secret), gerado na
// migração e guardado em prevision_config — nunca no código.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PREVISION_URL = 'https://api.prevision.com.br/graphql'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const QUERY_ACTIVIDADES = `
  query($projectId: ID!, $after: String) {
    me {
      project(id: $projectId) {
        activitiesPage(after: $after, first: 50) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            startAt
            endAt
            percentageCompleted
            workDuration
            service { name }
          }
        }
      }
    }
  }
`

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)

  const config = await admin.from('prevision_config').select('*').limit(1).maybeSingle()
  if (config.error || !config.data) return json({ erro: 'Sem configuração da Prevision.' }, 500)

  const segredo = req.headers.get('x-cron-secret')
  if (!segredo || segredo !== config.data.cron_secret) return json({ erro: 'Não autorizado.' }, 401)

  const links = await admin.from('prevision_project_links').select('*')
  if (links.error) return json({ erro: links.error.message }, 500)
  if (!links.data || links.data.length === 0) return json({ resultados: [] })

  const resultados = []
  for (const link of links.data) {
    try {
      const itens = await buscarAtividades(config.data.api_key, link.prevision_project_id)
      const r = await admin.rpc('importar_cronograma_global_service', {
        p_itens: itens,
        p_worksite_id: link.worksite_id,
      })
      if (r.error) throw new Error(r.error.message)
      const { criados, atualizados } = r.data?.[0] || { criados: 0, atualizados: 0 }
      await admin.from('prevision_project_links').update({
        ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null,
      }).eq('worksite_id', link.worksite_id)
      resultados.push({
        obra: link.worksite_id, projeto: link.prevision_project_name,
        total_atividades: itens.length, criados, atualizados,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[prevision-sync]', link.prevision_project_name, msg)
      await admin.from('prevision_project_links').update({ ultimo_erro: msg }).eq('worksite_id', link.worksite_id)
      resultados.push({ obra: link.worksite_id, projeto: link.prevision_project_name, erro: msg })
    }
  }

  return json({ resultados })
})

async function buscarAtividades(apiKey: string, projectId: string) {
  const brutos: any[] = []
  let after = ''
  for (;;) {
    const resp = await fetch(PREVISION_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'UserAuthorization': `token ${apiKey}`,
      },
      body: JSON.stringify({ query: QUERY_ACTIVIDADES, variables: { projectId, after } }),
    })
    const body = await resp.json()
    if (body.error) throw new Error(body.error.message || 'Erro na API da Prevision.')
    if (body.errors?.length) throw new Error(body.errors[0].message)
    const page = body.data?.me?.project?.activitiesPage
    if (!page) throw new Error('Resposta inesperada da Prevision — projeto sem dados de atividades.')

    brutos.push(...page.nodes)

    if (!page.pageInfo.hasNextPage) break
    after = page.pageInfo.endCursor
  }

  const itens = brutos
    .map((a) => {
      const dataInicio = a.startAt ? String(a.startAt).slice(0, 10) : null
      const dataFim = a.endAt ? String(a.endAt).slice(0, 10) : null
      const pct = a.percentageCompleted
      const concluida = pct != null && pct >= 100
      const iniciada = pct != null && pct > 0
      return {
        codigo_externo: String(a.id),
        descricao: a.service?.name || `Atividade ${a.id}`,
        lote: null,
        caminho_critico: false,
        data_inicio: dataInicio,
        data_fim: dataFim,
        duracao: a.workDuration ?? null,
        inicio_real: concluida || iniciada ? dataInicio : null,
        fim_real: concluida ? dataFim : null,
        duracao_real: concluida ? (a.workDuration ?? null) : null,
        percentual_prevision: pct ?? null,
      }
    })
    .filter((i) => i.data_inicio && i.data_fim)

  return itens
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
