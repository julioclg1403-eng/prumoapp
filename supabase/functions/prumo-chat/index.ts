// Mesmo padrão de defesa em profundidade de redefinir-senha e
// transcrever-audio: verify_jwt (config da plataforma) já barra quem
// não está autenticado, mas confere de novo aqui dentro -- se algum
// dia o verify_jwt for desligado por engano no painel, o endpoint não
// vira um proxy público e gratuito pra API paga da Anthropic. Origem
// restrita ao domínio real do app pelo mesmo motivo.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const ORIGENS_PERMITIDAS = new Set([
  'https://prumoapp-kohl.vercel.app',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const permitida = origin && ORIGENS_PERMITIDAS.has(origin) ? origin : 'https://prumoapp-kohl.vercel.app'
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VOZ = `

VOCÊ ESTÁ FALANDO POR VOZ: sua resposta será lida em voz alta. Responda em no máximo 3 frases curtas, sem listas, sem tabelas, sem markdown, sem emojis e sem URLs. Fale números por extenso quando for natural ("doze pessoas"). Se o assunto for longo, resuma o principal e ofereça detalhar.`

function montarSystemPrompt(contexto: { agora_iso?: string; fuso?: string; modo_voz?: boolean; instrucoes_extras?: string } | undefined) {
  let infoData = ''
  if (contexto?.agora_iso) {
    try {
      const agora = new Date(contexto.agora_iso)
      const fuso = contexto.fuso || 'America/Sao_Paulo'
      const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        timeZone: fuso, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(agora)
      const horaFormatada = new Intl.DateTimeFormat('pt-BR', {
        timeZone: fuso, hour: '2-digit', minute: '2-digit',
      }).format(agora)
      const isoData = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora)
      infoData = `\n\nAgora é ${dataFormatada}, ${horaFormatada} (fuso ${fuso}). Data de hoje em ISO: ${isoData}. Use isso pra calcular "hoje", "amanhã", "essa semana" etc. — nunca pergunte a data pro usuário, você já sabe.`
    } catch {
      infoData = ''
    }
  }
  return `Você é a Ana, a assistente do Prumoapp, um sistema de gestão de obras. Fala como gente
de obra: português simples, frases curtas, tom simpático e direto, sem enrolação. Trate o
usuário (engenheiro, mestre ou encarregado) como colega de canteiro.
Ajuda com dúvidas sobre diário de obra, pendências, efetivo, planejamento e demais módulos
do app. Quando não souber algo específico dos dados da obra, diga isso claramente em vez de
inventar.

Regras da Ana:
- Pergunte uma coisa por vez, e só o que realmente falta.
- Nunca invente número, nome ou status: tudo vem de ferramenta. Diga de onde vem o número
  ("pelo rendimento da obra", "SINAPI SP 09/2026").
- Antes de gravar ou mudar qualquer coisa no app, mostre o resumo do que vai fazer e espere o
  "pode" do usuário; só depois use a ferramenta. Consultas e abrir telas não precisam de confirmação.
- Assunto estrutural (rachadura, tirar parede, dimensionamento) é do engenheiro responsável:
  oriente a procurar ele, você não dimensiona.${infoData}${contexto?.modo_voz ? VOZ : ''}${typeof contexto?.instrucoes_extras === 'string' ? `

${contexto.instrucoes_extras.slice(0, 3000)}` : ''}

Você tem ferramentas pra agir de verdade no app, não só falar sobre ele:
- Quando o usuário pedir pra abrir, ver ou ir pra alguma tela (ex: "abre o diário de hoje"),
  use a ferramenta abrir_tela.
- Quando perguntar sobre rendimento, produtividade ou "quem mais produz" em algum serviço,
  use a ferramenta consultar_rendimento e baseie a resposta SOMENTE no resultado dela —
  nunca invente nome de colaborador ou número. Se o resultado vier vazio ou com erro, diga
  isso claramente ao usuário.
- Use as demais ferramentas de consulta (diário, efetivo, pendências, lembretes, estoque,
  suprimentos, segurança) sempre que a pergunta for sobre dados reais da obra — nunca
  invente número, nome ou status que não veio de uma ferramenta.
- Ferramentas que criam ou mudam dados (criar_lembrete, resolver_pendencia,
  vincular_suprimentos_automaticamente) só fazem o que o pedido explicitamente pede.
  Se faltar alguma informação obrigatória (por exemplo a data de um lembrete) e você já
  sabe a data de hoje pelo contexto acima, calcule sozinho — só pergunte se for algo que
  realmente só o usuário sabe.
- Você também tem busca na web. Use pra trazer referência externa quando o usuário pedir
  — por exemplo índice de produtividade do SINAPI pra um serviço específico, preço de
  mercado, norma técnica (NR, ABNT). Prefira fontes oficiais (gov.br, caixa.gov.br,
  portais de governo estadual) e SEMPRE diga a fonte e a data/mês de referência do dado
  que achou — SINAPI muda de valor todo mês e por estado, então nunca cite um número sem
  deixar claro de onde e de quando ele é. Quando o pedido for comparar com a produtividade
  real da obra, cruze o dado externo com o resultado de consultar_rendimento — nunca com
  um número da sua memória.
- Quando o pedido pedir pra responder SOMENTE com um JSON (sem nenhum texto antes ou
  depois), va direto pro JSON assim que tiver a informação suficiente da busca — não some
  tempo/tokens narrando o raciocínio nem explorando fontes demais; uma ou duas buscas bem
  direcionadas bastam.
Depois de usar uma ferramenta, sempre responda em texto pro usuário confirmando o que foi
feito ou encontrado — nunca termine só com a chamada da ferramenta, sem explicar o resultado.`
}

// ── Provedor OpenAI ─────────────────────────────────────────────────
// O app fala o formato da Anthropic (blocos text/tool_use/tool_result, stop_reason).
// Aqui traduzimos pra API de chat da OpenAI e de volta, sem mexer no app.
// Sem busca na web nessa rota (a busca era uma ferramenta própria da Anthropic).
const MODELO_OPENAI = Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4.1'

function paraMensagensOpenAI(system: string, messages: any[]) {
  const out: any[] = [{ role: 'system', content: system }]
  for (const m of messages || []) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue }
    const blocos = Array.isArray(m.content) ? m.content : []
    if (m.role === 'assistant') {
      const texto = blocos.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      const chamadas = blocos.filter((b: any) => b.type === 'tool_use').map((b: any) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
      }))
      const msg: any = { role: 'assistant', content: texto || null }
      if (chamadas.length) msg.tool_calls = chamadas
      if (msg.content !== null || chamadas.length) out.push(msg)
    } else {
      for (const b of blocos) {
        if (b.type === 'tool_result') {
          out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) })
        } else if (b.type === 'text') {
          out.push({ role: 'user', content: b.text })
        }
      }
    }
  }
  return out
}

async function responderComOpenAI(messages: any[], tools: any[], contexto: any, CORS: Record<string, string>) {
  const system = `${montarSystemPrompt(contexto)}\n\nAtenção: a busca na web não está disponível agora. Se o usuário pedir um dado externo (SINAPI, norma, preço de mercado), diga que não consegue buscar na internet nesta versão e ofereça usar só os dados do Prumo.`
  const ferramentas = (Array.isArray(tools) ? tools : [])
    .filter((t: any) => t && t.name && !String(t.type || '').startsWith('web_search'))
    .map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object', properties: {} } } }))

  const body: Record<string, unknown> = {
    model: MODELO_OPENAI,
    max_completion_tokens: 4096,
    messages: paraMensagensOpenAI(system, messages),
  }
  if (ferramentas.length) body.tools = ferramentas

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) {
    console.error('OpenAI API error:', r.status, JSON.stringify(data))
    return new Response(JSON.stringify({ error: data?.error?.message || 'Erro ao falar com a IA' }), {
      status: 500, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const msg = data.choices?.[0]?.message || {}
  const content: any[] = []
  if (msg.content) content.push({ type: 'text', text: msg.content })
  for (const c of msg.tool_calls || []) {
    let input = {}
    try { input = JSON.parse(c.function?.arguments || '{}') } catch { input = {} }
    content.push({ type: 'tool_use', id: c.id, name: c.function?.name, input })
  }
  return new Response(JSON.stringify({ content, stop_reason: (msg.tool_calls || []).length ? 'tool_use' : 'end_turn' }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Não autenticado.' }), {
      status: 401,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) {
    return new Response(JSON.stringify({ error: 'Não autenticado.' }), {
      status: 401,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  try {
    const { messages, tools, contexto } = await req.json()

    // Por padrão a IA é a da OpenAI (crédito já pago). Pra voltar pro Claude pela API,
    // defina o segredo IA_PROVEDOR = anthropic (e uma ANTHROPIC_API_KEY válida).
    if (Deno.env.get('IA_PROVEDOR') !== 'anthropic') {
      return await responderComOpenAI(messages, tools, contexto, CORS)
    }

    const ferramentas = Array.isArray(tools) ? [...tools] : []
    ferramentas.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 })

    const body: Record<string, unknown> = {
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      system: montarSystemPrompt(contexto),
      messages,
      tools: ferramentas,
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data))
      return new Response(JSON.stringify({ error: data?.error?.message || 'Erro ao falar com a IA' }), {
        status: 500,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ content: data.content, stop_reason: data.stop_reason }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
