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
import { useDados } from '../lib/DadosContext'
import { cronoEmbutido, tarefasDoPainel, observarArquivos, classificarArquivo } from '../lib/gerencialPonte'
import { ImportarSuprimentos } from './suprimentos'
import { ImportarContratos } from './contratos'
import { ImportarCronogramaGlobal } from './planejamento-global'

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
  const dados = useDados()
  const obraId = dados.obra.id
  const iframeRef = useRef(null)
  const entradaRef = useRef(null)
  const desligarRef = useRef(null)
  const [avisos, setAvisos] = useState([])
  const [folha, setFolha] = useState(null) // tela de importação aberta: { tipo, arquivo, ignorar, id }
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

  /* ── Ponte com o Prumo ─────────────────────────────────────────
     Quando um arquivo é anexado DENTRO do painel (ou pelo botão 📎), o Prumo identifica:
       cronograma  → atualiza sozinho a Linha de balanço do Início (só cronograma) e oferece
                     atualizar as datas do Planejamento Global;
       compras     → oferece atualizar o Suprimentos;
       CONTRATOS-UAU → oferece atualizar o módulo Contratos.
     Suprimentos, Contratos e Global abrem a MESMA tela de importação que já têm (com a prévia
     de novos, atualizados e removidos): nada grava às cegas. */
  const adicionarAviso = (a) => setAvisos((l) => [...l.filter((x) => x.id !== a.id), a].slice(-4))
  const fecharAviso = (id) => setAvisos((l) => l.filter((x) => x.id !== id))

  const enviarCronograma = async (win, crono, origem) => {
    const s = tarefasDoPainel(win, crono)
    const { error } = await supabase.rpc('gerencial_salvar_cronograma', {
      p_worksite_id: obraId, p_gerado_em: s.geradoEm, p_origem: origem, p_tarefas: s.tarefas, p_locais: s.locais,
    })
    if (error) throw error
    return s
  }

  const tratarArquivo = async (win, file) => {
    let c
    try { c = await classificarArquivo(win, file) } catch { return }
    const id = `${c.tipo}:${file.name}:${file.size}`
    if (c.tipo === 'crono') {
      try {
        const s = await enviarCronograma(win, c.crono, file.name)
        adicionarAviso({ id, tipo: 'crono', nome: file.name, arquivo: file, ignorar: s.idsDuplicados, qtd: s.tarefas.length })
      } catch {
        adicionarAviso({ id, tipo: 'erro', texto: `Li o cronograma ${file.name}, mas não consegui atualizar a linha de balanço do Início.` })
      }
    } else if (c.tipo === 'compras') {
      adicionarAviso({ id, tipo: 'compras', nome: file.name, arquivo: file })
    } else if (c.tipo === 'contratos') {
      adicionarAviso({ id, tipo: 'contratos', nome: file.name, arquivo: file })
    } else if (c.tipo === 'contratos-painel') {
      adicionarAviso({ id, tipo: 'info', texto: 'Esse é o relatório de contratos que só o painel lê. O módulo Contratos do Prumo usa a planilha CONTRATOS-UAU: anexe ela pelo botão 📎 para atualizar o módulo.' })
    }
  }

  // primeira vez: se o Início ainda não tem a linha de balanço, grava a foto do cronograma que vem no painel
  const semearInicio = async (win, doc) => {
    try {
      const { data, error } = await supabase.from('gerencial_cronograma').select('gerado_em').eq('worksite_id', obraId).maybeSingle()
      if (error || data) return
      const crono = cronoEmbutido(doc)
      if (crono?.tasks?.length) await enviarCronograma(win, crono, 'painel (dados embutidos)')
    } catch { /* sem a tabela ou sem permissão: o Início só não mostra a linha de balanço */ }
  }

  const abrirFolha = async (aviso) => {
    // a tela cheia esconde o resto do Prumo: sai dela pra mostrar a tela de importação
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch { /* já saiu */ } }
    setCheia(false)
    setFolha(aviso)
  }

  useEffect(() => () => { if (desligarRef.current) desligarRef.current() }, [])

  // escreve o painel na moldura assim que ela carregar e liga a ponte
  const aoCarregarMoldura = () => {
    const doc = iframeRef.current?.contentDocument
    const win = iframeRef.current?.contentWindow
    if (!doc || !win || !htmlEmCache) return
    doc.open()
    doc.write(htmlEmCache)
    doc.close()
    if (desligarRef.current) desligarRef.current()
    desligarRef.current = observarArquivos(doc, (f) => tratarArquivo(win, f))
    semearInicio(win, doc)
  }

  const anexarPeloPrumo = (e) => {
    const lista = Array.from(e.target.files || [])
    e.target.value = ''
    const win = iframeRef.current?.contentWindow
    if (win) lista.forEach((f) => tratarArquivo(win, f))
  }

  const altura = desktop ? '100vh' : 'calc(100dvh - 72px)'
  const pilula = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #d6d8db', borderRadius: 999,
    background: '#fff', color: '#18181B', font: '600 12px system-ui, sans-serif', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.12)',
  }

  if (etapa === 'painel') {
    return (
      <>
        <div
          ref={caixaRef}
          style={cheia
            ? { position: 'fixed', inset: 0, zIndex: 2000, height: '100dvh', background: '#f4f4f3' }
            : { position: 'relative', height: altura, background: '#f4f4f3' }}
        >
          <div style={{ position: 'absolute', top: 10, right: 16, zIndex: 5, display: 'flex', gap: 8 }}>
            <input ref={entradaRef} type="file" hidden multiple accept=".xlsx,.xls,.xlsm" onChange={anexarPeloPrumo} />
            <button
              type="button" onClick={() => entradaRef.current?.click()} style={pilula}
              title="Anexe aqui o cronograma, a planilha de compras ou a CONTRATOS-UAU: o Prumo atualiza o Início, o Suprimentos e o Contratos junto com o Gerencial"
            >
              📎 Anexar ao Prumo
            </button>
            <button type="button" onClick={alternarTelaCheia} style={pilula} title={cheia ? 'Sair da tela cheia (Esc)' : 'Ocupar a tela inteira'}>
              {cheia ? '✕ Sair da tela cheia' : '⤢ Tela cheia'}
            </button>
          </div>

          <iframe
            ref={iframeRef} title="Gerencial Yacht" src="/gerencial-yacht/shell.html"
            onLoad={aoCarregarMoldura} style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
          />

          {avisos.length > 0 && (
            <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 440 }}>
              {avisos.map((a) => (
                <div
                  key={a.id}
                  style={{ background: '#18181B', color: '#FAFAFA', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.4, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}
                >
                  {a.tipo === 'crono' && <div><b>Cronograma lido:</b> {a.nome}. Linha de balanço do Início atualizada ({a.qtd} atividades).</div>}
                  {a.tipo === 'compras' && <div><b>Planilha de compras:</b> {a.nome}</div>}
                  {a.tipo === 'contratos' && <div><b>CONTRATOS-UAU:</b> {a.nome}</div>}
                  {(a.tipo === 'info' || a.tipo === 'erro') && <div>{a.texto}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {a.tipo === 'crono' && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirFolha({ tipo: 'global', arquivo: a.arquivo, ignorar: a.ignorar, id: a.id })}>
                        Atualizar datas no Planejamento
                      </button>
                    )}
                    {a.tipo === 'compras' && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirFolha({ tipo: 'compras', arquivo: a.arquivo, id: a.id })}>Atualizar Suprimentos</button>
                    )}
                    {a.tipo === 'contratos' && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirFolha({ tipo: 'contratos', arquivo: a.arquivo, id: a.id })}>Atualizar Contratos</button>
                    )}
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => fecharAviso(a.id)}>Fechar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ImportarCronogramaGlobal
          aberto={folha?.tipo === 'global'} dados={dados} arquivoInicial={folha?.tipo === 'global' ? folha.arquivo : null}
          ignorarCodigos={folha?.ignorar} onFechar={() => { if (folha) fecharAviso(folha.id); setFolha(null) }}
        />
        <ImportarSuprimentos
          aberto={folha?.tipo === 'compras'} dados={dados} arquivoInicial={folha?.tipo === 'compras' ? folha.arquivo : null}
          onFechar={() => { if (folha) fecharAviso(folha.id); setFolha(null) }}
        />
        <ImportarContratos
          aberto={folha?.tipo === 'contratos'} dados={dados} arquivoInicial={folha?.tipo === 'contratos' ? folha.arquivo : null}
          onFechar={() => { if (folha) fecharAviso(folha.id); setFolha(null) }}
        />
      </>
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
