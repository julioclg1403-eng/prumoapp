// ============================================================
// WEBHOOK DO WHATSAPP -- entrada única de tudo que chega pelo canal
// (BRIEFING, seção 6). GET é o aperto de mão que a Meta exige pra
// aceitar a URL; POST é toda mensagem de verdade.
//
// Sem verify_jwt: quem chama aqui é a Meta, não o app logado -- a
// autenticação é a assinatura HMAC (meta.ts, assinaturaValida),
// não um token do Supabase.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { organizacao, contatoPorTelefone, contextoDaObra, registrarMensagem, atualizarMensagem } from './db.ts'
import { enviarTexto, baixarMidia, assinaturaValida } from './meta.ts'
import { transcrever, classificar } from './ia.ts'
import {
  gravarPendencia, gravarLembrete, gravarRascunhoRequisicao,
  gravarAndamentoServico, gravarFotoDoDia,
} from './handlers.ts'

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // ── Verificação da URL, exigida pela Meta na primeira configuração ──
  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const desafio = url.searchParams.get('hub.challenge')
    if (modo === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(desafio, { status: 200 })
    }
    return new Response('Token de verificação inválido.', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Método não aceito.', { status: 405 })

  const corpoCru = await req.text()
  if (!(await assinaturaValida(corpoCru, req.headers.get('X-Hub-Signature-256')))) {
    console.error('[webhook] assinatura inválida -- requisição recusada.')
    return new Response('Assinatura inválida.', { status: 401 })
  }

  const payload = JSON.parse(corpoCru)
  const org = await organizacao()
  if (!org) return new Response('OK', { status: 200 }) // organização ainda não existe; nada a fazer

  const mensagens = payload.entry?.[0]?.changes?.[0]?.value?.messages || []
  const nomesPerfil = payload.entry?.[0]?.changes?.[0]?.value?.contacts || []

  for (const msg of mensagens) {
    await processarMensagem(org.id, msg, nomesPerfil.find((c: { wa_id: string }) => c.wa_id === msg.from))
  }

  // A Meta só precisa de um 200 rápido; não interessa a ela o que
  // aconteceu por dentro. Erro de processamento vira aviso PRO
  // REMETENTE (dentro de processarMensagem), não erro HTTP aqui --
  // devolver erro faria a Meta reenviar a mesma mensagem em loop.
  return new Response('OK', { status: 200 })
})

async function processarMensagem(
  organizationId: string,
  msg: Record<string, unknown>,
  contatoMeta: { profile?: { name?: string } } | undefined,
) {
  const de = msg.from as string
  const tipo = msg.type as string

  const contato = await contatoPorTelefone(organizationId, de, contatoMeta?.profile?.name || null)
  const linhaMensagem = await registrarMensagem({
    organization_id: organizationId,
    worksite_id: contato?.perfil?.worksite_id || null,
    contact_id: contato?.id,
    direcao: 'recebida',
    tipo: tipo === 'text' ? 'texto' : tipo === 'audio' ? 'audio' : tipo === 'image' ? 'imagem' : 'outro',
    wa_message_id: msg.id,
    conteudo: (msg.text as { body?: string })?.body || (msg.image as { caption?: string })?.caption || null,
  })

  // Número que ninguém vinculou a um perfil ainda -- só um admin
  // pelo app resolve isso (fora do escopo desta função). Avisa e para.
  if (!contato?.perfil) {
    await enviarTexto(de, 'Seu número ainda não está vinculado a uma conta no Prumo. Peça pro administrador te cadastrar.')
    if (linhaMensagem) await atualizarMensagem(linhaMensagem.id, { status: 'ignorada' })
    return
  }

  const perfil = contato.perfil as { id: string; organization_id: string; worksite_id: string }

  try {
    if (tipo === 'image') {
      const midia = await baixarMidia((msg.image as { id: string }).id)
      if (!midia) throw new Error('não consegui baixar a foto')
      const legenda = (msg.image as { caption?: string }).caption || null
      const resultado = await gravarFotoDoDia(perfil, midia.bytes, legenda)
      await enviarTexto(de, resultado.erro ? `Não consegui salvar a foto: ${resultado.erro}` : 'Foto salva no diário de hoje.')
      if (linhaMensagem) {
        await atualizarMensagem(linhaMensagem.id, {
          status: resultado.erro ? 'erro' : 'processada', erro: resultado.erro,
          resultado_tabela: resultado.tabela, resultado_id: resultado.id,
        })
      }
      return
    }

    let texto: string | null = null
    if (tipo === 'text') texto = (msg.text as { body: string }).body
    if (tipo === 'audio') {
      const midia = await baixarMidia((msg.audio as { id: string }).id)
      if (!midia) throw new Error('não consegui baixar o áudio')
      texto = await transcrever(midia.bytes, midia.mimeType)
      if (linhaMensagem && texto) await atualizarMensagem(linhaMensagem.id, { transcricao: texto })
    }

    if (!texto) {
      await enviarTexto(de, 'Não consegui entender essa mensagem. Pode mandar em texto ou áudio?')
      if (linhaMensagem) await atualizarMensagem(linhaMensagem.id, { status: 'erro', erro: 'sem texto para classificar' })
      return
    }

    const { locais, servicos } = await contextoDaObra(perfil.worksite_id)
    const classificacao = await classificar(texto, {
      locais: locais.map((l) => l.nome), servicos: servicos.map((s) => s.nome),
      agora: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
      nomeRemetente: contatoMeta?.profile?.name || 'você',
    })

    if (!classificacao) throw new Error('não consegui interpretar a mensagem')

    let resultado: { tabela: string; id?: string; erro?: string } | null = null
    if (classificacao.categoria === 'pendencia' && classificacao.pendencia) {
      resultado = await gravarPendencia(perfil, classificacao.pendencia)
    } else if (classificacao.categoria === 'andamento_servico' && classificacao.andamento) {
      resultado = await gravarAndamentoServico(perfil, classificacao.andamento, locais, servicos)
    } else if (classificacao.categoria === 'lembrete' && classificacao.lembrete) {
      resultado = await gravarLembrete(perfil, classificacao.lembrete)
    } else if (classificacao.categoria === 'requisicao' && classificacao.requisicao) {
      resultado = await gravarRascunhoRequisicao(perfil, classificacao.requisicao)
    }

    const respostaFinal = resultado?.erro
      ? `${classificacao.resposta_confirmacao}\n\n(Não consegui gravar: ${resultado.erro}. Um responsável pode fazer isso pelo app.)`
      : classificacao.resposta_confirmacao
    await enviarTexto(de, respostaFinal)

    if (linhaMensagem) {
      await atualizarMensagem(linhaMensagem.id, {
        status: resultado?.erro ? 'erro' : 'processada', erro: resultado?.erro,
        resultado_tabela: resultado?.tabela, resultado_id: resultado?.id,
      })
    }
  } catch (e) {
    console.error('[webhook] erro ao processar mensagem:', e)
    await enviarTexto(de, 'Tive um problema pra processar sua mensagem. Tenta de novo em instantes.')
    if (linhaMensagem) await atualizarMensagem(linhaMensagem.id, { status: 'erro', erro: String(e) })
  }
}
