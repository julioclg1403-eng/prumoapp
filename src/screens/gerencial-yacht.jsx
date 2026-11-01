/* ============================================================
   GERENCIAL YACHT — o painel da obra (fluxo, orçamento, cronograma,
   linha de balanço, medição da Caixa…) dentro do Prumo, igual ao
   original: o HTML inteiro roda numa moldura (iframe), sem mudar
   uma linha dele.

   Acesso: SÓ o administrador, e ainda com uma senha própria da aba
   (definida por ele na primeira vez). O painel leva dados reais da
   obra, então não existe em claro na pasta pública: vem criptografado
   (public/gerencial-yacht/obra-yacht.enc) e a chave só sai do banco
   pelo RPC gerencial_yacht_chave(senha), que confere admin + senha
   (bcrypt no banco; 5 erros seguidos bloqueiam por 15 minutos).
   Aqui a gente descriptografa no navegador e escreve na moldura
   /gerencial-yacht/shell.html (mesma origem; a única página do Prumo
   com política que aceita scripts inline).

   Quem manda no que o painel guarda (planejamento, simulação da
   Caixa, arquivos importados) é ele mesmo, no localStorage deste
   navegador — igual ao arquivo original.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo, useDesktop } from '../components'

let htmlEmCache = null // depois de destravado, trocar de aba não pede a senha de novo (recarregar o app pede)

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function descriptografar(linha) {
  const resposta = await fetch('/gerencial-yacht/obra-yacht.enc', { cache: 'no-cache' })
  if (!resposta.ok) throw new Error('ARQUIVO')
  const cifrado = await resposta.arrayBuffer()
  const chave = await crypto.subtle.importKey('raw', bytes(linha.chave), 'AES-GCM', false, ['decrypt'])
  let comprimido
  try {
    comprimido = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(linha.iv) }, chave, cifrado)
  } catch {
    throw new Error('DESCRIPTOGRAFAR') // a chave do banco não bate com o arquivo publicado
  }
  return new Response(new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

const ERROS = {
  ARQUIVO: 'Não consegui baixar o painel. Verifique a conexão e tente de novo.',
  DESCRIPTOGRAFAR: 'O painel publicado e a chave do banco não combinam (atualização incompleta). Tente de novo em alguns minutos.',
}

export default function GerencialYacht() {
  const desktop = useDesktop()
  const iframeRef = useRef(null)
  const caixaRef = useRef(null)
  const [cheia, setCheia] = useState(false) // painel ocupando a tela inteira (esconde o menu do Prumo)
  // verificando | sem_acesso | criar | senha | bloqueado | painel | erro
  const [etapa, setEtapa] = useState(htmlEmCache ? 'painel' : 'verificando')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (htmlEmCache) return undefined
    let vivo = true
    ;(async () => {
      const { data, error } = await supabase.rpc('gerencial_yacht_status')
      if (!vivo) return
      if (error) { setAviso('Não consegui verificar o acesso agora. Tente de novo em instantes.'); setEtapa('erro'); return }
      if (!data?.admin) setEtapa('sem_acesso')
      else if (!data.senha_definida) setEtapa('criar')
      else if (data.bloqueado) setEtapa('bloqueado')
      else setEtapa('senha')
    })()
    return () => { vivo = false }
  }, [])

  const abrir = async (senhaDigitada) => {
    const { data, error } = await supabase.rpc('gerencial_yacht_chave', { p_senha: senhaDigitada })
    if (error) { setAviso('Você não tem acesso ao Gerencial Yacht.'); setEtapa('sem_acesso'); return }
    if (!data?.ok) {
      if (data?.motivo === 'bloqueado') { setEtapa('bloqueado'); return }
      if (data?.motivo === 'sem_chave') { setAviso('O painel ainda não foi publicado no banco (falta a chave). Avise quem administra o sistema.'); setEtapa('erro'); return }
      if (data?.motivo === 'senha') {
        setAviso(data.restantes > 0 ? `Senha incorreta. Restam ${data.restantes} tentativa(s).` : 'Senha incorreta. Acesso bloqueado por 15 minutos.')
        if (data.restantes === 0) setEtapa('bloqueado')
        return
      }
      setAviso('Não consegui abrir o painel.'); setEtapa('erro'); return
    }
    try {
      htmlEmCache = await descriptografar(data)
      setSenha(''); setConfirmar(''); setAviso('')
      setEtapa('painel')
    } catch (e) {
      setAviso(ERROS[e.message] || 'Não consegui abrir o painel.')
      setEtapa('erro')
    }
  }

  const enviarSenha = async (ev) => {
    ev.preventDefault()
    if (ocupado) return
    setAviso('')
    if (etapa === 'criar') {
      if (senha.length < 8) { setAviso('Use pelo menos 8 caracteres.'); return }
      if (senha !== confirmar) { setAviso('As duas senhas não são iguais.'); return }
    }
    setOcupado(true)
    try {
      if (etapa === 'criar') {
        const { data, error } = await supabase.rpc('gerencial_yacht_definir_senha', { p_nova: senha })
        if (error || !data?.ok) { setAviso('Não consegui salvar a senha. Tente de novo.'); return }
      }
      await abrir(senha)
    } finally {
      setOcupado(false)
    }
  }

  /* Tela cheia: o painel cobre o app inteiro e, onde o navegador deixa, também a barra do
     navegador (API de tela cheia). Esc sai. A mesma caixa muda de estilo, sem recriar a moldura,
     pra o painel não recarregar e perder o que está na tela. */
  const alternarTelaCheia = async () => {
    if (!cheia) {
      setCheia(true)
      try { await caixaRef.current?.requestFullscreen?.() } catch { /* sem API: fica só a cobertura do app */ }
    } else {
      setCheia(false)
      if (document.fullscreenElement) { try { await document.exitFullscreen() } catch { /* já saiu */ } }
    }
  }

  useEffect(() => {
    const aoMudar = () => { if (!document.fullscreenElement) setCheia(false) } // Esc do navegador
    document.addEventListener('fullscreenchange', aoMudar)
    return () => {
      document.removeEventListener('fullscreenchange', aoMudar)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // escreve o painel na moldura assim que ela carregar
  const aoCarregarMoldura = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc || !htmlEmCache) return
    doc.open()
    doc.write(htmlEmCache)
    doc.close()
  }

  const altura = desktop ? '100vh' : 'calc(100dvh - 72px)'

  if (etapa === 'painel') {
    return (
      <div
        ref={caixaRef}
        style={cheia
          ? { position: 'fixed', inset: 0, zIndex: 2000, height: '100dvh', background: '#f4f4f3' }
          : { position: 'relative', height: altura, background: '#f4f4f3' }}
      >
        <button
          type="button" onClick={alternarTelaCheia}
          title={cheia ? 'Sair da tela cheia (Esc)' : 'Ocupar a tela inteira'}
          style={{
            position: 'absolute', top: 10, right: 16, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', border: '1px solid #d6d8db', borderRadius: 999, background: '#fff', color: '#18181B',
            font: '600 12px system-ui, sans-serif', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.12)',
          }}
        >
          {cheia ? '✕ Sair da tela cheia' : '⤢ Tela cheia'}
        </button>
        <iframe
          ref={iframeRef} title="Gerencial Yacht" src="/gerencial-yacht/shell.html"
          onLoad={aoCarregarMoldura} style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: desktop ? 80 : 32 }}>
      <div className="stack-2" style={{ width: '100%', maxWidth: 380 }}>
        <div>
          <div className="t-title" style={{ fontSize: 20 }}>Gerencial Yacht</div>
          <div className="t-caption">Painel da obra: fluxo, orçamento, cronograma e medição da Caixa.</div>
        </div>

        {etapa === 'verificando' && <div className="t-caption">Verificando acesso…</div>}

        {etapa === 'sem_acesso' && (
          <div className="card-flat">
            <div className="t-strong">Acesso restrito</div>
            <div className="t-caption" style={{ marginTop: 4 }}>{aviso || 'Esta área é só do administrador.'}</div>
          </div>
        )}

        {etapa === 'bloqueado' && (
          <div className="card-flat">
            <div className="t-strong">Acesso bloqueado por alguns minutos</div>
            <div className="t-caption" style={{ marginTop: 4 }}>Foram muitas tentativas com senha errada. Tente de novo em 15 minutos.</div>
          </div>
        )}

        {etapa === 'erro' && (
          <div className="card-flat">
            <div className="t-strong">Não foi possível abrir</div>
            <div className="t-caption" style={{ marginTop: 4 }}>{aviso}</div>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Tentar de novo</button>
          </div>
        )}

        {(etapa === 'criar' || etapa === 'senha') && (
          <form className="card-flat stack-2" onSubmit={enviarSenha}>
            <div className="t-strong">{etapa === 'criar' ? 'Crie a senha do Gerencial Yacht' : 'Digite a senha'}</div>
            {etapa === 'criar' && (
              <div className="t-caption">Só você, como administrador, entra aqui. Esta senha é diferente da senha do Prumo. Use pelo menos 8 caracteres e guarde bem.</div>
            )}
            <Campo label={etapa === 'criar' ? 'Nova senha' : 'Senha'}>
              <input
                className="ipt" type="password" value={senha} autoFocus
                autoComplete={etapa === 'criar' ? 'new-password' : 'current-password'}
                onChange={(e) => setSenha(e.target.value)}
              />
            </Campo>
            {etapa === 'criar' && (
              <Campo label="Repita a senha">
                <input className="ipt" type="password" value={confirmar} autoComplete="new-password" onChange={(e) => setConfirmar(e.target.value)} />
              </Campo>
            )}
            {aviso && <div className="t-caption" style={{ color: 'var(--danger)' }}>{aviso}</div>}
            <button className="btn btn-primary" type="submit" disabled={ocupado || !senha}>
              {ocupado ? 'Abrindo…' : etapa === 'criar' ? 'Criar senha e abrir' : 'Abrir painel'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
