/* ============================================================
   NOTIFICAÇÕES — vive dentro da aba Cadastros (um tipo selecionável
   ali, igual Empresas/Colaboradores/etc.), não é mais tela própria.

   Quem recebe push assim que algo acontece em cada módulo, nesta
   obra — diferente de Lembretes (que é por horário marcado): aqui
   é por evento, disparado na hora (diário finalizado, refeição
   lançada, pendência aberta, planejamento atualizado). Ver
   notificarRegra em DadosContext.jsx, que lê esta tabela.

   Agrupado por módulo, com os eventos de cada um lado a lado (uma
   grade que colapsa pra uma coluna só no celular) — Diário e
   Refeições têm mais de um evento (rascunho/finalizado/pendente),
   e ficar rolando um card cheio por evento tornava isso cansativo
   de configurar.

   Sem botão "Salvar": cada clique (adicionar/remover pessoa) já
   grava na hora — é mais simples e evita a tela ficar com um
   rascunho "esquecido" sem salvar.
   ============================================================ */

import { useMemo, useState } from 'react'
import { Icon, Chip } from '../components'

const GRUPOS = [
  {
    rotulo: 'Diário',
    eventos: [
      { chave: 'diario_rascunho', rotulo: 'Rascunho salvo', desc: 'Salvou sem finalizar' },
      { chave: 'diario_finalizado', rotulo: 'Finalizado', desc: 'Diário do dia concluído' },
      { chave: 'diario_pendente', rotulo: 'Ainda não feito', desc: 'Aviso automático, seg-sáb ~14h' },
    ],
  },
  {
    rotulo: 'Refeições',
    eventos: [
      { chave: 'refeicoes', rotulo: 'Lançamento salvo', desc: 'Um lançamento foi feito' },
      { chave: 'refeicoes_pendente', rotulo: 'Ainda não preenchida', desc: 'Aviso automático, seg-sáb ~14h' },
    ],
  },
  {
    rotulo: 'Pendências',
    eventos: [{ chave: 'pendencias', rotulo: 'Pendência nova', desc: 'Quando uma pendência é aberta' }],
  },
  {
    rotulo: 'Planejamento',
    eventos: [{ chave: 'planejamento', rotulo: 'Atualizado', desc: 'Editado na mão ou pela sincronização com a Prevision' }],
  },
  {
    rotulo: 'Projetos',
    eventos: [{ chave: 'projetos', rotulo: 'Apontamento publicado', desc: 'Um apontamento novo fica visível' }],
  },
]

export default function NotificacoesConteudo({ dados }) {
  return (
    <div className="stack-2">
      <div className="alert info">
        Só admin vê e mexe nesta aba. Isto só cadastra quem deve ser avisado — cada pessoa
        também precisa ativar as notificações no aparelho dela — em Lembretes, o botão
        "Ativar" — para receber de verdade.
      </div>

      {GRUPOS.map((g) => (
        <div key={g.rotulo} className="card-flat">
          <div className="t-strong" style={{ fontSize: 16 }}>{g.rotulo}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginTop: 10,
            }}
          >
            {g.eventos.map((evento) => (
              <RegraEvento key={evento.chave} evento={evento} dados={dados} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RegraEvento({ evento, dados }) {
  const [busca, setBusca] = useState('')
  const regra = dados.regrasNotificacao.find((r) => r.modulo === evento.chave)
  const destinatariosIds = regra?.destinatarios_ids || []

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return dados.perfis
      .filter((p) => !destinatariosIds.includes(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 6)
  }, [busca, dados.perfis, destinatariosIds])

  const adicionar = (id) => {
    setBusca('')
    dados.salvarRegraNotificacao(evento.chave, [...destinatariosIds, id])
  }
  const remover = (id) => {
    dados.salvarRegraNotificacao(evento.chave, destinatariosIds.filter((x) => x !== id))
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <div className="t-strong" style={{ fontSize: 13.5 }}>{evento.rotulo}</div>
      <div className="t-caption" style={{ marginTop: 2 }}>{evento.desc}</div>

      <div className="stack-1" style={{ marginTop: 8 }}>
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
          placeholder="Buscar pessoa…"
          style={{ fontSize: 13.5 }}
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
