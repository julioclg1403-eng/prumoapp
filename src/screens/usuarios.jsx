/* ============================================================
   USUÁRIOS — só o admin chega aqui.

   Convite: o admin informa nome, e-mail, perfil e obra e manda o
   link pelo próprio WhatsApp. A pessoa só cria a senha e já entra:
   o convite é a liberação. Não existe cadastro aberto.

   Esconder este item do menu também não é segurança. A trava é o
   gatilho `protege_papel` no Postgres: só quem é admin na tabela
   `profiles` consegue gravar uma mudança de papel.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { Icon, Chip, PageHeader, Confirmar, Vazio, ChipToggle } from '../components'
import { MODULOS_RESTRINGIVEIS } from '../lib/dominio'
import Convites from '../components/Convites'
import TrocasDeSenha, { useTrocasDeSenha } from '../components/TrocasDeSenha'

const PAPEIS = [
  { valor: 'campo', rotulo: 'Campo', desc: 'Lança diário, presença e pendências. Celular no canteiro.' },
  { valor: 'gestao', rotulo: 'Gestão', desc: 'Indicadores, revisão dos cadastros feitos no campo, acompanhamento.' },
  { valor: 'admin', rotulo: 'Admin', desc: 'Tudo da gestão, mais convidar pessoas, definir o acesso e liberar troca de senha.' },
]

const ROTULO_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]))

export default function Usuarios({ voltar, perfil }) {
  const dados = useDados()
  const [confirmar, setConfirmar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const trocas = useTrocasDeSenha()

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

  const liberarSenha = (u) => {
    setConfirmar({
      titulo: 'Liberar troca de senha?',
      texto: `Cria um link para ${u.nome} criar uma senha nova. A senha atual continua valendo até a nova ser salva.`,
      rotuloOk: 'Liberar',
      onOk: async () => { setConfirmar(null); await trocas.liberar(u.id) },
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
          <TrocasDeSenha trocas={trocas} empresa={dados.org.nome} />

          <Convites
            empresa={dados.org.nome} obras={dados.obras}
            obraPadrao={perfil.worksite_id} papeis={PAPEIS} aoEntrarAlguem={dados.recarregar}
          />

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
                          className="btn btn-ghost btn-sm" onClick={() => liberarSenha(u)} disabled={ocupado || trocas.ocupado}
                          aria-label={`Liberar troca de senha de ${u.nome}`} title="Liberar troca de senha"
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
              <li>Em <strong>Convidar pessoa</strong>, escreva o nome e o e-mail, escolha o perfil e a obra e envie pelo WhatsApp, só para essa pessoa.</li>
              <li>Ela abre o link, <strong>cria a senha</strong> e já entra na obra.</li>
              <li>O link vale uma vez, por 48 horas. Mandou errado? Toque em <strong>Cancelar</strong>.</li>
              <li>O convite não cria Admin: se precisar, mude o perfil depois. Quem esqueceu a senha pede pela tela de entrada; libere aqui (ou use o botão <strong>Senha</strong> no cartão da pessoa) e envie o link.</li>
            </ol>
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
