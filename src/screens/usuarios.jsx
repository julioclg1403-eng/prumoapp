/* ============================================================
   USUÁRIOS — só o admin chega aqui.

   Não existe "convidar por e-mail" nesta versão, e isso é
   decisão, não falta: mandar convite exige a chave administrativa
   do Supabase, que NUNCA pode ir para o navegador (BRIEFING,
   seção 8, item 1). Qualquer pessoa abriria o código da página e
   teria poder total sobre o banco.

   O caminho é o inverso e é seguro: a pessoa cria a conta sozinha
   na tela de entrada, cai aqui sem papel nenhum — sem enxergar um
   dado sequer — e o admin libera.

   Esconder este item do menu também não é segurança. A trava é o
   gatilho `protege_papel` no Postgres: só quem é admin na tabela
   `profiles` consegue gravar uma mudança de papel.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { Icon, Chip, PageHeader, Confirmar, Vazio, ChipToggle, Sheet } from '../components'
import { MODULOS_RESTRINGIVEIS } from '../lib/dominio'

/* Sem 0/O, 1/l/I nem outro caractere fácil de confundir ditando por
   telefone — essa senha vai ser lida em voz alta pro WhatsApp. */
function gerarSenhaTemporaria() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

const PAPEIS = [
  { valor: 'campo', rotulo: 'Campo', desc: 'Lança diário, presença e pendências. Celular no canteiro.' },
  { valor: 'gestao', rotulo: 'Gestão', desc: 'Indicadores, revisão dos cadastros feitos no campo, acompanhamento.' },
  { valor: 'admin', rotulo: 'Admin', desc: 'Tudo da gestão, mais liberar o acesso de quem se cadastrou.' },
]

const ROTULO_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]))

export default function Usuarios({ voltar, perfil }) {
  const dados = useDados()
  const [confirmar, setConfirmar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [senhaNova, setSenhaNova] = useState(null) // { nome, senha } — mostrado uma vez só

  const aguardando = dados.perfis.filter((u) => !u.role || !u.organization_id)
  const ativos = dados.perfis.filter((u) => u.role && u.organization_id)
  const contatosWhatsapp = dados.contatosWhatsapp || []

  const aplicar = async (u, papel) => {
    setOcupado(true)
    await dados.definirPapel(u.id, papel)
    setOcupado(false)
  }

  const trocarPapel = (u, papel) => {
    if (u.role === papel) return
    if (u.id === perfil.id && papel !== 'admin') {
      setConfirmar({
        titulo: 'Rebaixar a própria conta?',
        texto: 'Você perde o acesso a esta tela e não conseguirá voltar sozinho. Só outro admin poderia devolver seu acesso.',
        rotuloOk: 'Rebaixar mesmo assim', perigo: true,
        onOk: async () => { setConfirmar(null); await aplicar(u, papel) },
      })
      return
    }
    aplicar(u, papel)
  }

  const alternarRestricao = async (u) => {
    setOcupado(true)
    if (u.modulos_permitidos == null) {
      await dados.definirModulosPermitidos(u.id, MODULOS_RESTRINGIVEIS.map((m) => m.chave))
    } else {
      await dados.definirModulosPermitidos(u.id, null)
    }
    setOcupado(false)
  }

  const alternarModulo = async (u, chave) => {
    const atual = u.modulos_permitidos || []
    const novo = atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]
    setOcupado(true)
    await dados.definirModulosPermitidos(u.id, novo)
    setOcupado(false)
  }

  const alternarRestricaoObra = async (u) => {
    setOcupado(true)
    if (u.obras_permitidas == null) {
      await dados.definirObrasPermitidas(u.id, dados.obras.map((o) => o.id))
    } else {
      await dados.definirObrasPermitidas(u.id, null)
    }
    setOcupado(false)
  }

  const redefinirSenha = (u) => {
    setConfirmar({
      titulo: 'Redefinir a senha?',
      texto: `Gera uma senha temporária nova pra ${u.nome}. A senha antiga dela para de funcionar na hora — passe a nova pra ela assim que der.`,
      rotuloOk: 'Redefinir',
      onOk: async () => {
        setConfirmar(null)
        setOcupado(true)
        const senha = gerarSenhaTemporaria()
        const ok = await dados.redefinirSenhaUsuario(u.id, senha)
        setOcupado(false)
        if (ok) setSenhaNova({ nome: u.nome, senha })
      },
    })
  }

  const alternarObra = async (u, obraId) => {
    const atual = u.obras_permitidas || []
    const novo = atual.includes(obraId) ? atual.filter((c) => c !== obraId) : [...atual, obraId]
    setOcupado(true)
    await dados.definirObrasPermitidas(u.id, novo)
    setOcupado(false)
  }

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Usuários</div>
          <div className="sub">{dados.org.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader titulo="Usuários" sub="Quem tem acesso e com qual perfil" />

        <div className="stack-3">
          {/* ── Fila de liberação ── */}
          <div>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="t-micro">Aguardando liberação</div>
              {aguardando.length > 0 && <Chip tom="info">{aguardando.length}</Chip>}
            </div>

            {aguardando.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo="Ninguém esperando"
                  texto="Quando alguém criar uma conta na tela de entrada, ela aparece aqui para você liberar."
                />
              </div>
            ) : (
              <div className="stack-1">
                {aguardando.map((u) => (
                  <div key={u.id} className="card-flat" style={{ borderLeft: '4px solid var(--info)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <div className="t-strong" style={{ fontSize: 15 }}>{u.nome || 'Sem nome'}</div>
                      <div className="t-caption" style={{ marginTop: 2 }}>{u.email}</div>
                      <div className="t-caption" style={{ marginTop: 6, color: 'var(--text-3)' }}>
                        Criou a conta mas ainda não vê nenhum dado da obra.
                      </div>
                    </div>
                    <div className="row-wrap">
                      {PAPEIS.map((p) => (
                        <button
                          key={p.valor} className="btn btn-primary btn-sm"
                          onClick={() => trocarPapel(u, p.valor)} disabled={ocupado}
                        >
                          Liberar como {p.rotulo}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Quem já tem acesso ── */}
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>Com acesso</div>
            <div className="stack-1">
              {ativos.map((u) => (
                <div key={u.id} className="card-flat">
                  <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                    <div className="grow">
                      <div className="t-strong" style={{ fontSize: 15 }}>
                        {u.nome}
                        {u.id === perfil.id && (
                          <span className="t-caption" style={{ fontWeight: 400 }}> · você</span>
                        )}
                      </div>
                      <div className="t-caption" style={{ marginTop: 2 }}>
                        {u.email}{u.cargo ? ` · ${u.cargo}` : ''}
                      </div>
                    </div>
                    <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
                      <Chip tom={u.role === 'admin' ? 'info' : ''}>{ROTULO_PAPEL[u.role]}</Chip>
                      {u.id !== perfil.id && (
                        <button
                          className="btn btn-ghost btn-sm" onClick={() => redefinirSenha(u)} disabled={ocupado}
                          aria-label={`Redefinir senha de ${u.nome}`} title="Redefinir senha"
                        >
                          <Icon name="editar" size={15} /> Senha
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="row-wrap">
                    {PAPEIS.map((p) => (
                      <button
                        key={p.valor}
                        className={`btn btn-sm ${u.role === p.valor ? 'btn-dark' : 'btn-secondary'}`}
                        onClick={() => trocarPapel(u, p.valor)}
                        disabled={ocupado}
                        aria-pressed={u.role === p.valor}
                      >
                        {p.rotulo}
                      </button>
                    ))}
                  </div>

                  {u.role !== 'admin' && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div className="row-between" style={{ marginBottom: 8 }}>
                        <span className="t-caption">Módulos</span>
                        <button
                          className="btn btn-ghost btn-sm" onClick={() => alternarRestricao(u)} disabled={ocupado}
                        >
                          {u.modulos_permitidos == null ? 'Restringir acesso' : 'Liberar tudo'}
                        </button>
                      </div>
                      {u.modulos_permitidos == null ? (
                        <div className="t-caption">Vê todos os módulos.</div>
                      ) : (
                        <div className="row-wrap">
                          {MODULOS_RESTRINGIVEIS.map((m) => (
                            <ChipToggle
                              key={m.chave}
                              ativo={u.modulos_permitidos.includes(m.chave)}
                              onClick={() => alternarModulo(u, m.chave)}
                            >
                              {m.rotulo}
                            </ChipToggle>
                          ))}
                        </div>
                      )}

                      <div className="row-between" style={{ margin: '14px 0 8px' }}>
                        <span className="t-caption">Obras</span>
                        <button
                          className="btn btn-ghost btn-sm" onClick={() => alternarRestricaoObra(u)} disabled={ocupado}
                        >
                          {u.obras_permitidas == null ? 'Restringir acesso' : 'Liberar tudo'}
                        </button>
                      </div>
                      {u.obras_permitidas == null ? (
                        <div className="t-caption">Vê todas as obras.</div>
                      ) : (
                        <div className="row-wrap">
                          {dados.obras.map((o) => (
                            <ChipToggle
                              key={o.id}
                              ativo={u.obras_permitidas.includes(o.id)}
                              onClick={() => alternarObra(u, o.id)}
                            >
                              {o.nome}
                            </ChipToggle>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Números de WhatsApp ── */}
          <div>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="t-micro">Números de WhatsApp</div>
              {contatosWhatsapp.some((c) => !c.profile_id) && (
                <Chip tom="info">{contatosWhatsapp.filter((c) => !c.profile_id).length} sem vínculo</Chip>
              )}
            </div>

            {contatosWhatsapp.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo="Nenhum número escreveu ainda"
                  texto="Quando alguém mandar a primeira mensagem para o número do Prumo, ela aparece aqui para você vincular a uma conta."
                />
              </div>
            ) : (
              <div className="stack-1">
                {contatosWhatsapp.map((c) => {
                  const vinculado = ativos.find((u) => u.id === c.profile_id)
                  return (
                    <div key={c.id} className="card-flat">
                      <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                        <div className="grow">
                          <div className="t-strong" style={{ fontSize: 15 }}>{c.nome_whatsapp || 'Sem nome no WhatsApp'}</div>
                          <div className="t-caption" style={{ marginTop: 2 }}>{c.telefone}</div>
                        </div>
                        <Chip tom={vinculado ? '' : 'info'}>{vinculado ? vinculado.nome : 'Sem vínculo'}</Chip>
                      </div>
                      <div className="row-wrap" style={{ gap: 8, alignItems: 'center' }}>
                        <select
                          className="input"
                          style={{ maxWidth: 260 }}
                          value={c.profile_id || ''}
                          disabled={ocupado}
                          onChange={(e) => dados.vincularContatoWhatsapp(c.id, e.target.value || null)}
                        >
                          <option value="">Sem vínculo</option>
                          {ativos.map((u) => (
                            <option key={u.id} value={u.id}>{u.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="card-flat" style={{ marginTop: 10 }}>
              <div className="t-caption" style={{ lineHeight: 1.6 }}>
                Vincular liga o número à conta: mensagens desse número passam a virar
                pendência, atualização do diário, lembrete ou foto, na obra da pessoa.
                Sem vínculo, o bot responde pedindo pra você cadastrar.
              </div>
            </div>
          </div>

          {/* ── Como alguém entra ── */}
          <div className="card-flat">
            <div className="t-micro" style={{ marginBottom: 8 }}>Como dar acesso a alguém</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>
              <li>A pessoa abre o app e clica em <strong>Criar uma conta</strong>.</li>
              <li>Ela aparece aqui, na fila acima.</li>
              <li>Você escolhe o perfil dela. A partir daí ela enxerga a obra.</li>
            </ol>
            <div className="alert info" style={{ marginTop: 12 }}>
              Não existe convite por e-mail de propósito: mandar convite exigiria guardar a senha
              mestra do banco dentro da página, onde qualquer um leria.
            </div>
          </div>

          <div className="card-flat">
            <div className="t-micro" style={{ marginBottom: 8 }}>O que cada perfil enxerga</div>
            <div className="stack-1">
              {PAPEIS.map((p) => (
                <div key={p.valor} style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <strong>{p.rotulo}</strong>
                  <span style={{ color: 'var(--text-2)' }}> — {p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <Sheet
        aberto={Boolean(senhaNova)}
        titulo="Senha redefinida"
        onFechar={() => setSenhaNova(null)}
        rodape={
          <button className="btn btn-primary btn-block" onClick={() => setSenhaNova(null)}>Fechar</button>
        }
      >
        {senhaNova && (
          <div className="stack-2">
            <div className="t-caption">
              Passe essa senha pra <strong>{senhaNova.nome}</strong> agora (WhatsApp, por exemplo) —
              ela só aparece aqui uma vez.
            </div>
            <div
              className="card-flat" style={{ textAlign: 'center', padding: 18 }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                {senhaNova.senha}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-block"
              onClick={async () => {
                try { await navigator.clipboard.writeText(senhaNova.senha) } catch { /* clipboard indisponível */ }
              }}
            >
              Copiar senha
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}
