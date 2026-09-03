const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function montarSystemPrompt(contexto: { agora_iso?: string; fuso?: string } | undefined) {
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
  return `Você é o assistente do Prumoapp, um sistema de gestão de obras.
Ajuda o usuário (engenheiro, mestre ou encarregado) com dúvidas sobre diário de obra,
pendências, efetivo, planejamento e demais módulos do app. Seja direto, use linguagem
de canteiro e, quando não souber algo específico dos dados da obra, diga isso claramente
em vez de inventar.${infoData}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, tools, contexto } = await req.json()

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
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ content: data.content, stop_reason: data.stop_reason }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
