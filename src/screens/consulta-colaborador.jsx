/* ============================================================
   CONSULTA DE COLABORADOR — via QR Code

   Tela só de leitura, sem nenhuma ação de editar/registrar/excluir:
   nome, função e empresa do colaborador, e duas abas — status de
   Treinamentos NR e EPIs entregues a ele. Sem entrada no menu —
   só chega aqui por quem escaneia o QR do colaborador (gerado em
   Segurança > Treinamentos NR); useAbrirQrColaborador.js cuida da
   ponta de chegada.
   ============================================================ */

import { useMemo, useState } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  formatarData, formatarDataCurta,
  ROTULO_STATUS_TREINAMENTO, TOM_STATUS_TREINAMENTO, statusTreinamento,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Vazio } from '../components'

export default function ConsultaColaborador({ voltar, params = {} }) {
  const dados = useDados()
  const [aba, setAba] = useState('treinamentos')
  const colaborador = dados.colaboradorPorId(params.workerId)

  const tipos = useMemo(
    () => (dados.tiposTreinamento || []).filter((t) => t.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.tiposTreinamento],
  )
  const treinamentosDoColaborador = useMemo(
    () => (dados.treinamentosColaboradores || []).filter((t) => t.worker_id === colaborador?.id),
    [dados.treinamentosColaboradores, colaborador],
  )
  const entregasEpi = useMemo(
    () => (dados.saidasEpi || [])
      .filter((s) => s.worker_id === colaborador?.id)
      .sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.saidasEpi, colaborador],
  )
  const nomeMaterialEpi = (id) => dados.materiaisEpi?.find((m) => m.id === id)?.nome || 'EPI removido'
  const unidadeMaterialEpi = (id) => dados.materiaisEpi?.find((m) => m.id === id)?.unidade || ''

  if (!colaborador) {
    return (
      <>
        <div className="topbar">
          {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
          <div className="grow"><div style={{ fontSize: 17, fontWeight: 700 }}>Consulta de colaborador</div></div>
        </div>
        <div className="page">
          <div className="card-flat">
            <Vazio titulo="Colaborador não encontrado" texto="O link pode estar errado, ou o cadastro foi removido." />
          </div>
        </div>
      </>
    )
  }

  const empresa = colaborador.company_id ? dados.nomeDe(dados.empresas, colaborador.company_id) : null

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>{colaborador.nome}</div>
          <div className="sub">{colaborador.funcao || 'Sem função cadastrada'}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader
          titulo={colaborador.nome}
          sub={[colaborador.funcao || 'Sem função cadastrada', empresa].filter(Boolean).join(' · ')}
        />

        <div className="alert info" style={{ marginBottom: 4 }}>
          Consulta só de leitura — nada aqui pode ser editado por este link.
        </div>

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'treinamentos', rotulo: 'Treinamentos NR', contador: tipos.length },
              { valor: 'epi', rotulo: 'EPI Entregues', contador: entregasEpi.length },
            ]}
          />

          {aba === 'treinamentos' && (
            tipos.length === 0 ? (
              <div className="card-flat">
                <Vazio titulo="Nenhum tipo de treinamento cadastrado" texto="Fale com a gestão da obra." />
              </div>
            ) : (
              <div className="stack-1">
                {tipos.map((t) => {
                  const doTipo = treinamentosDoColaborador.filter((x) => x.training_type_id === t.id)
                  const ultimo = [...doTipo].sort((a, b) => (a.data_realizacao < b.data_realizacao ? 1 : -1))[0]
                  const status = ultimo ? statusTreinamento(ultimo.data_vencimento) : 'pendente'
                  return (
                    <div key={t.id} className="card-flat" style={{ padding: 10 }}>
                      <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="t-strong" style={{ fontSize: 14 }}>{t.sigla ? `${t.sigla} — ${t.nome}` : t.nome}</div>
                          {ultimo ? (
                            <div className="t-caption" style={{ marginTop: 4 }}>
                              Realizado em {formatarData(ultimo.data_realizacao)}
                              {ultimo.data_vencimento && ` · vence em ${formatarData(ultimo.data_vencimento)}`}
                            </div>
                          ) : (
                            <div className="t-caption" style={{ marginTop: 4 }}>Nunca realizado</div>
                          )}
                        </div>
                        <Chip tom={TOM_STATUS_TREINAMENTO[status]}>{ROTULO_STATUS_TREINAMENTO[status]}</Chip>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {aba === 'epi' && (
            entregasEpi.length === 0 ? (
              <div className="card-flat">
                <Vazio titulo="Nenhum EPI entregue ainda" texto="Quando a obra registrar uma entrega pra este colaborador, aparece aqui." />
              </div>
            ) : (
              <div className="stack-1">
                {entregasEpi.map((s) => (
                  <div key={s.id} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                    <div>
                      <div className="t-strong" style={{ fontSize: 14 }}>{nomeMaterialEpi(s.material_id)}</div>
                      <div className="t-caption" style={{ marginTop: 2 }}>{formatarDataCurta(s.data)}</div>
                    </div>
                    <span className="t-strong" style={{ fontSize: 14 }}>{s.quantidade} {unidadeMaterialEpi(s.material_id)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}
