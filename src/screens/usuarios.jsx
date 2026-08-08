/* ============================================================
   USUÁRIOS — só o admin chega aqui.
   Ele é o único que cria conta para os outros; não existe
   auto-cadastro no produto.

   ATENÇÃO para a Etapa 7: esconder este item do menu NÃO é
   segurança. Quem trocar o papel no navegador continua sendo
   barrado só quando a política do banco (RLS) disser que
   `profiles` só aceita alteração vinda de um admin. O menu é
   conveniência; a trava é o Postgres.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { USAR_MOCK } from '../lib/config'
import { Icon, Chip, PageHeader, Sheet, Campo, Confirmar, ItemLista } from '../components'

const PAPEIS = [
  { valor: 'campo', rotulo: 'Campo', desc: 'Lança diário, presença e pendências. Celular no canteiro.' },
  { valor: 'gestao', rotulo: 'Gestão', desc: 'Vê os indicadores, revisa cadastros e acompanha tudo.' },
  { valor: 'admin', rotulo: 'Admin', desc: 'Tudo da gestão, mais criar e liberar usuários.' },
]

const ROTULO_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]))

export default function Usuarios({ voltar, perfil }) {
  const dados = useDados()
  const [convidando, setConvidando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)

  const trocarPapel = (u, papel) => {
    if (u.id === perfil.id && papel !== 'admin') {
      setConfirmar({
        titulo: 'Rebaixar a própria conta?',
        texto: 'Você perde o acesso a esta tela e não conseguirá voltar sozinho. Outro admin teria que devolver seu acesso.',
        rotuloOk: 'Rebaixar mesmo assim', perigo: true,
        onOk: () => { aplicarPapel(u, papel); setConfirmar(null) },
      })
      return
    }
    aplicarPapel(u, papel)
  }

  const aplicarPapel = (u, papel) => {
    dados.setPerfis((l) => l.map((x) => (x.id === u.id ? { ...x, role: papel } : x)))
  }

  const convidar = () => {
    const email = (convidando?.email || '').trim().toLowerCase()
    const nome = (convidando?.nome || '').trim()
    if (!email || !nome) return
    dados.setPerfis((l) => [
      ...l,
      {
        id: `u-${Date.now()}`, organization_id: dados.org.id, worksite_id: dados.obra.id,
        nome, email, role: convidando.role || 'campo', cargo: convidando.cargo || '', ativo: true,
      },
    ])
    setConvidando(null)
  }

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Usuários</div>
          <div className="sub">{dados.org.nome}</div>
        </div>
        <button onClick={() => setConvidando({ role: 'campo' })} aria-label="Convidar">
          <Icon name="mais_sinal" size={22} />
        </button>
      </div>

      <div className="page">
        <PageHeader
          titulo="Usuários"
          sub="Quem tem acesso e com qual perfil"
          acao={
            <button className="btn btn-primary" onClick={() => setConvidando({ role: 'campo' })}>
              <Icon name="mais_sinal" size={18} /> Convidar
            </button>
          }
        />

        <div className="stack-2">
          {USAR_MOCK && (
            <div className="alert info">
              Nesta versão de demonstração o convite só cria o usuário na memória do navegador.
              Quando o banco entrar (Etapa 7), o convite passa a mandar um e-mail de verdade e o perfil
              é criado por um gatilho no Postgres.
            </div>
          )}

          <div className="stack-1">
            {dados.perfis.map((u) => (
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
                  <Chip tom={u.role === 'admin' ? 'info' : ''}>{ROTULO_PAPEL[u.role] || 'Sem papel'}</Chip>
                </div>
                <div className="row-wrap">
                  {PAPEIS.map((p) => (
                    <button
                      key={p.valor}
                      className={`btn btn-sm ${u.role === p.valor ? 'btn-dark' : 'btn-secondary'}`}
                      onClick={() => trocarPapel(u, p.valor)}
                      aria-pressed={u.role === p.valor}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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

      <Sheet
        aberto={Boolean(convidando)}
        titulo="Convidar usuário"
        onFechar={() => setConvidando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setConvidando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={convidar}
              disabled={!convidando?.nome?.trim() || !convidando?.email?.trim()}
            >
              Convidar
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Nome">
            <input
              className="ipt" autoFocus value={convidando?.nome || ''}
              onChange={(e) => setConvidando((c) => ({ ...c, nome: e.target.value }))}
            />
          </Campo>
          <Campo label="E-mail">
            <input
              className="ipt" type="email" value={convidando?.email || ''}
              onChange={(e) => setConvidando((c) => ({ ...c, email: e.target.value }))}
              placeholder="pessoa@example.com"
            />
          </Campo>
          <Campo label="Cargo">
            <input
              className="ipt" value={convidando?.cargo || ''}
              onChange={(e) => setConvidando((c) => ({ ...c, cargo: e.target.value }))}
              placeholder="Mestre de obras, engenharia…"
            />
          </Campo>
          <Campo label="Perfil de acesso">
            <select
              className="sel" value={convidando?.role || 'campo'}
              onChange={(e) => setConvidando((c) => ({ ...c, role: e.target.value }))}
            >
              {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </Campo>
        </div>
      </Sheet>

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
