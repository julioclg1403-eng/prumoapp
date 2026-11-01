/* ============================================================
   GERENCIAL YACHT — o painel da obra (fluxo, orçamento, cronograma,
   linha de balanço, medição da Caixa…) dentro do Prumo, igual ao
   original: o HTML inteiro roda numa moldura (iframe), sem mudar
   uma linha dele.

   O painel leva os dados reais da obra, então não existe em claro
   na pasta pública. Ele vem criptografado (public/gerencial-yacht/
   obra-yacht.enc); a chave só sai do banco pelo RPC
   gerencial_yacht_chave(), pra quem é da gestão e tem o módulo.
   Aqui a gente baixa o arquivo, descriptografa no navegador e
   escreve na moldura /gerencial-yacht/shell.html (mesma origem, a
   única página do Prumo com política que aceita scripts inline).

   Quem manda no que o painel guarda (planejamento, simulação da
   Caixa, arquivos importados) é ele mesmo, no localStorage deste
   navegador — igual ao arquivo original.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDesktop } from '../components'

let htmlEmCache = null // evita baixar e descriptografar de novo ao trocar de aba

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function obterHtml() {
  if (htmlEmCache) return htmlEmCache

  const { data, error } = await supabase.rpc('gerencial_yacht_chave', { p_nome: 'obra-yacht' })
  if (error) {
    const semAcesso = error.code === '42501' || /sem acesso|módulo/i.test(error.message || '')
    throw new Error(semAcesso ? 'ACESSO' : 'CHAVE')
  }
  const linha = Array.isArray(data) ? data[0] : data
  if (!linha || !linha.chave) throw new Error('SEM_CHAVE')

  const resposta = await fetch('/gerencial-yacht/obra-yacht.enc', { cache: 'no-cache' })
  if (!resposta.ok) throw new Error('ARQUIVO')
  const cifrado = await resposta.arrayBuffer()

  const chave = await crypto.subtle.importKey('raw', bytes(linha.chave), 'AES-GCM', false, ['decrypt'])
  let comprimido
  try {
    comprimido = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(linha.iv) }, chave, cifrado)
  } catch {
    throw new Error('DESCRIPTOGRAFAR') // chave do banco não bate com o arquivo publicado
  }
  const html = await new Response(new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
  htmlEmCache = html
  return html
}

const MENSAGENS = {
  ACESSO: 'Você não tem acesso ao Gerencial Yacht. Peça ao administrador para liberar em Usuários.',
  CHAVE: 'Não consegui obter a chave do painel agora. Tente de novo em instantes.',
  SEM_CHAVE: 'O painel ainda não foi liberado no banco (falta a chave). Avise o administrador.',
  ARQUIVO: 'Não consegui baixar o painel. Verifique a conexão e tente de novo.',
  DESCRIPTOGRAFAR: 'O painel publicado e a chave do banco não combinam (atualização incompleta). Avise o administrador.',
}

export default function GerencialYacht() {
  const desktop = useDesktop()
  const iframeRef = useRef(null)
  const [moldura, setMoldura] = useState(false) // a página vazia do iframe já carregou
  const [estado, setEstado] = useState('carregando') // carregando | pronto | erro
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!moldura) return undefined
    let vivo = true
    ;(async () => {
      try {
        const html = await obterHtml()
        if (!vivo) return
        const doc = iframeRef.current?.contentDocument
        if (!doc) return
        doc.open()
        doc.write(html)
        doc.close()
        setEstado('pronto')
      } catch (e) {
        if (!vivo) return
        setErro(MENSAGENS[e.message] || 'Não consegui abrir o painel.')
        setEstado('erro')
      }
    })()
    return () => { vivo = false }
  }, [moldura])

  return (
    <div style={{ position: 'relative', height: desktop ? '100vh' : 'calc(100dvh - 72px)', background: '#f4f4f3' }}>
      <iframe
        ref={iframeRef}
        title="Gerencial Yacht"
        src="/gerencial-yacht/shell.html"
        onLoad={() => setMoldura(true)}
        style={{ border: 0, width: '100%', height: '100%', display: estado === 'erro' ? 'none' : 'block' }}
      />
      {estado !== 'pronto' && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, textAlign: 'center', background: 'var(--bg, #f4f4f3)', pointerEvents: estado === 'erro' ? 'auto' : 'none',
          }}
        >
          {estado === 'erro' ? (
            <div className="stack-2" style={{ maxWidth: 420 }}>
              <div className="t-strong">Gerencial Yacht</div>
              <div className="t-caption">{erro}</div>
            </div>
          ) : (
            <div className="t-caption">Abrindo o painel da obra…</div>
          )}
        </div>
      )}
    </div>
  )
}
