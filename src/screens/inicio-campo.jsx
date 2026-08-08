/* ============================================================
   INÍCIO — PERFIL DE CAMPO
   A primeira tela do dia. Responde três perguntas em um olhar:
   o diário de hoje está lançado? quem está na obra? o que está
   atrasado? Tudo o mais é atalho.
   ============================================================ */

import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarDataLonga, diarioDaData, situacaoDiario, totalPresentes,
  progressoDiario, filtrarPendencias, situacaoPendencia, contarPendencias, pendenciasGerais,
  pendentesDeRevisao, plural,
} from '../lib/dominio'
import { Icon, Chip, Indicador, ItemLista, Vazio, SeletorObra, useDesktop } from '../components'

export default function InicioCampo({ goto, irParaAba, perfil }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()

  const diarioHoje = diarioDaData(dados.diarios, hoje, dados.obra.id)
  const sit = situacaoDiario(diarioHoje)
  const previstasHoje = dados.planejamento.filter((p) => p.data === hoje)
  const progresso = progressoDiario(diarioHoje)

  const pendenciasGeraisDaObra = pendenciasGerais(dados.pendencias)
  const cont = contarPendencias(pendenciasGeraisDaObra, hoje)
  const prioritarias = filtrarPendencias(pendenciasGeraisDaObra, 'abertas', hoje)
    .map((p) => ({ p, s: situacaoPendencia(p, hoje) }))
    .filter((x) => x.s.chave === 'atrasada' || x.s.chave === 'vence_hoje')
    .sort((a, b) => (b.s.dias || 0) - (a.s.dias || 0))

  const revisoes = pendentesDeRevisao(dados.colaboradores)

  const abrirDiarioHoje = () => goto('diario', { data: hoje, id: diarioHoje?.id })

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>{perfil.nome}</div>
          <div className="sub">{formatarDataLonga(hoje)}</div>
        </div>
        {/* No desktop o seletor já está no menu lateral. */}
        {!desktop && dados.obras.length > 1 ? (
          <div style={{ width: 145, flex: 'none' }}>
            <SeletorObra obras={dados.obras} obraId={dados.obra.id} onTrocar={dados.trocarObra} escuro />
          </div>
        ) : (
          <Icon name="obra" size={22} />
        )}
      </div>

      <div className="page stack-3">
        {/* ── O diário de hoje ── */}
        <div className="card">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div className="t-micro">Diário de hoje</div>
            <Chip tom={sit.tom}>{sit.rotulo}</Chip>
          </div>

          {diarioHoje ? (
            <>
              <div className="row-flex" style={{ gap: 20, marginBottom: 14 }}>
                <div>
                  <div className="t-num" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                    {totalPresentes(diarioHoje)}
                  </div>
                  <div className="t-caption">na obra</div>
                </div>
                <div>
                  <div className="t-num" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                    {progresso.concluidas}/{progresso.total}
                  </div>
                  <div className="t-caption">frentes concluídas</div>
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={abrirDiarioHoje}>
                {diarioHoje.status === 'rascunho' ? 'Continuar o diário' : 'Ver o diário de hoje'}
              </button>
            </>
          ) : (
            <>
              <div className="t-caption" style={{ marginBottom: 14, lineHeight: 1.5 }}>
                Nada lançado ainda hoje.{' '}
                {previstasHoje.length > 0
                  ? `Há ${plural(previstasHoje.length, 'frente prevista', 'frentes previstas')}.`
                  : 'Nenhuma frente prevista — dá para lançar mesmo assim.'}
              </div>
              <button className="btn btn-primary btn-block" onClick={abrirDiarioHoje}>
                <Icon name="mais_sinal" size={18} /> Lançar o diário de hoje
              </button>
            </>
          )}
        </div>

        {/* ── Números do dia ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Indicador rotulo="Previstas" valor={previstasHoje.length} onClick={abrirDiarioHoje} />
          <Indicador
            rotulo="Atrasadas" valor={cont.atrasadas} tom={cont.atrasadas ? 'danger' : undefined}
            onClick={() => irParaAba('pendencias')}
          />
          <Indicador rotulo="Em aberto" valor={cont.abertas} onClick={() => irParaAba('pendencias')} />
        </div>

        {/* ── Pendências que não podem esperar ── */}
        <div>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="t-micro">Precisa de atenção</div>
            <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
              Ver todas <Icon name="avancar" size={14} />
            </button>
          </div>

          {prioritarias.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada atrasado"
                texto="Nenhuma pendência venceu. Quando alguma passar do prazo, ela aparece aqui."
              />
            </div>
          ) : (
            <div className="stack-1">
              {prioritarias.slice(0, 3).map(({ p, s }) => (
                <ItemLista
                  key={p.id}
                  titulo={p.titulo}
                  sub={dados.perfilPorId(p.responsavel_id)?.nome || 'Sem responsável'}
                  aviso={s.chave === 'atrasada'}
                  direita={<Chip tom={s.tom}>{s.rotulo}</Chip>}
                  onClick={() => goto('pendencias', { destacar: p.id })}
                />
              ))}
              {prioritarias.length > 3 && (
                <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
                  + {prioritarias.length - 3} além destas
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Cadastros provisórios feitos no campo ── */}
        {revisoes.length > 0 && (
          <div className="alert info">
            {plural(revisoes.length, 'colaborador cadastrado', 'colaboradores cadastrados')} direto no
            diário {revisoes.length === 1 ? 'aguarda' : 'aguardam'} conferência da gestão.
          </div>
        )}
      </div>
    </>
  )
}
