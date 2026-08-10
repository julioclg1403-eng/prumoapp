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
import { Icon, Chip, PageHeader, Confirmar, Vazio } from '../components'

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
                    <Chip tom={u.role === 'admin' ? 'info' : ''}>{ROTULO_PAPEL[u.role]}</Chip>
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
                pendência, atualização do diário, lembrete, foto ou rascunho de requisição,
                na obra da pessoa. Sem vínculo, o bot responde pedindo pra você cadastrar.
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
    </>
  )
}
