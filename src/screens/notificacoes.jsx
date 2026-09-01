/* ============================================================
   NOTIFICAÇÕES

   Quem recebe push assim que algo acontece em cada módulo, nesta
   obra — diferente de Lembretes (que é por horário marcado): aqui
   é por evento, disparado na hora (diário finalizado, refeição
   lançada, pendência aberta, planejamento atualizado). Ver
   notificarRegra em DadosContext.jsx, que lê esta tabela.

   Sem botão "Salvar": cada clique (adicionar/remover pessoa) já
   grava na hora — é mais simples e evita a tela ficar com um
   rascunho "esquecido" sem salvar.
   ============================================================ */

import { useMemo, useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { Icon, Chip, PageHeader } from '../components'

const MODULOS = [
  { chave: 'diario', rotulo: 'Diário', desc: 'Quando alguém finaliza o diário do dia' },
  { chave: 'refeicoes', rotulo: 'Refeições', desc: 'Quando um lançamento de refeição é salvo' },
  { chave: 'pendencias', rotulo: 'Pendências', desc: 'Quando uma pendência nova é aberta' },
  { chave: 'planejamento', rotulo: 'Planejamento', desc: 'Quando o planejamento é atualizado' },
  { chave: 'projetos', rotulo: 'Projetos', desc: 'Quando um apontamento novo é publicado' },
]

export default function Notificacoes({ voltar }) {
  const dados = useDados()

  return (
    <>
      <div className="topbar">
        {voltar && (
          <button onClick={voltar} aria-label="Voltar">
            <Icon name="voltar" size={20} />
          </button>
        )}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Notificações</div>
          <div className="sub">Quem é avisado em cada módulo, nesta obra</div>
        </div>
      </div>

      <div className="page">
        <PageHeader titulo="Notificações" sub="Escolha quem recebe push quando algo acontece em cada módulo" />

        <div className="stack-2">
          <div className="alert info">
            Isto só cadastra quem deve ser avisado. Cada pessoa também precisa ativar as
            notificações no aparelho dela — em Lembretes, o botão "Ativar" — para receber de
            verdade.
          </div>

          {MODULOS.map((m) => (
            <RegraModulo key={m.chave} modulo={m} dados={dados} />
          ))}
        </div>
      </div>
    </>
  )
}

function RegraModulo({ modulo, dados }) {
  const [busca, setBusca] = useState('')
  const regra = dados.regrasNotificacao.find((r) => r.modulo === modulo.chave)
  const destinatariosIds = regra?.destinatarios_ids || []

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return dados.perfis
      .filter((p) => !destinatariosIds.includes(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [busca, dados.perfis, destinatariosIds])

  const adicionar = (id) => {
    setBusca('')
    dados.salvarRegraNotificacao(modulo.chave, [...destinatariosIds, id])
  }
  const remover = (id) => {
    dados.salvarRegraNotificacao(modulo.chave, destinatariosIds.filter((x) => x !== id))
  }

  return (
    <div className="card-flat">
      <div className="t-strong" style={{ fontSize: 15 }}>{modulo.rotulo}</div>
      <div className="t-caption" style={{ marginTop: 2 }}>{modulo.desc}</div>

      <div className="stack-1" style={{ marginTop: 10 }}>
        {destinatariosIds.length > 0 && (
          <div className="row-wrap" style={{ gap: 6 }}>
            {destinatariosIds.map((id) => (
              <Chip key={id}>
                {dados.perfilPorId(id)?.nome || '—'}
                <button
                  onClick={() => remover(id)} aria-label="Remover destinatário"
                  style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'inline-flex' }}
                >
                  <Icon name="x" size={12} />
                </button>
              </Chip>
            ))}
          </div>
        )}
        <input
          className="ipt" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa pelo nome…"
        />
        {resultados.length > 0 && (
          <div className="stack-1">
            {resultados.map((p) => (
              <button
                key={p.id} type="button" className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => adicionar(p.id)}
              >
                {p.nome}
              </button>
            ))}
          </div>
        )}
        {busca.trim() && resultados.length === 0 && (
          <div className="t-caption">Ninguém com esse nome.</div>
        )}
      </div>
    </div>
  )
}
