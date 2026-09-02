/* ============================================================
   CASCA DO PERFIL DE CAMPO — mestre de obras, encarregado.
   Pensada para o celular no canteiro: barra inferior com cinco
   destinos, botões grandes, poucos passos.

   Navegação por ESTADO, não por URL (sem React Router): a tela
   atual é uma variável; `goto` troca de tela. `voltar` mantém uma
   pilha própria para o botão voltar do cabeçalho funcionar.
   ============================================================ */

import { useState, useCallback } from 'react'
import { Icon, useDesktop, BarraErro, AvisoAbrirPeloIcone, SeletorObra, SinoNotificacoesPush } from '../components'
import ChatBot from '../components/ChatBot'
import { useDados } from '../lib/DadosContext'
import { useAbrirQrMaterial } from '../lib/useAbrirQrMaterial'
import { useAbrirQrColaborador } from '../lib/useAbrirQrColaborador'
import { contarPendencias, pendenciasGerais, moduloPermitido } from '../lib/dominio'

import InicioCampo from '../screens/inicio-campo'
import Diarios from '../screens/diarios'
import DiarioEditor from '../screens/diario-editor'
import Efetivo from '../screens/efetivo'
import Pendencias from '../screens/pendencias'
import Cadastros from '../screens/cadastros'
import Galeria from '../screens/galeria'
import Planejamento from '../screens/planejamento'
import Lembretes from '../screens/lembretes'
import Almoxarifado from '../screens/almoxarifado'
import Seguranca from '../screens/seguranca'
import Projetos from '../screens/projetos'
import Suprimentos from '../screens/suprimentos'
import Contratos from '../screens/contratos'
import Producao from '../screens/producao'
import ConsultaColaborador from '../screens/consulta-colaborador'

/* Mesma lista/filtro do AppGestao (dominio.moduloPermitido): admin
   sempre vê tudo, sem modulos_permitidos definido não tem restrição,
   senão só o que foi liberado em Usuários. Antes o Campo não filtrava
   nada — Projetos, por exemplo, nem existia aqui, então liberar em
   Usuários não tinha efeito nenhum pra quem era 'campo'. */
const TODOS_ITENS = [
  { chave: 'inicio', rotulo: 'Início', icone: 'inicio' },
  { chave: 'diarios', rotulo: 'Diário', icone: 'diario' },
  { chave: 'efetivo', rotulo: 'Efetivo', icone: 'efetivo' },
  { chave: 'pendencias', rotulo: 'Pendências', icone: 'pendencias' },
  { chave: 'planejamento', rotulo: 'Planejamento', desc: 'A semana da obra e o avanço físico por etapa', icone: 'planejamento' },
  { chave: 'galeria', rotulo: 'Galeria', desc: 'Todas as fotos da obra, por dia', icone: 'galeria' },
  { chave: 'lembretes', rotulo: 'Lembretes', desc: 'O que você marcou pra não esquecer', icone: 'lembrete' },
  { chave: 'equipamentos', rotulo: 'Almoxarifado', desc: 'Máquinas e ferramentas, e onde cada uma está', icone: 'equipamento' },
  { chave: 'suprimentos', rotulo: 'Suprimentos', desc: 'Pedidos de compra importados do sistema, com dashboard de prazo', icone: 'pedidos' },
  { chave: 'contratos', rotulo: 'Contratos', desc: 'Contratos importados do sistema, com cruzamento de itens entre eles', icone: 'relatorio' },
  { chave: 'producao', rotulo: 'Produtividade', desc: 'Marcação de execução na planta, medição por contrato e rendimento', icone: 'obra' },
  { chave: 'seguranca', rotulo: 'Segurança', desc: 'Ocorrências e advertências da obra', icone: 'alerta' },
  { chave: 'projetos', rotulo: 'Projetos', desc: 'Apontamentos entre projeto e obra, por disciplina', icone: 'projeto' },
  { chave: 'cadastros', rotulo: 'Cadastros', desc: 'Empresas, colaboradores, locais e serviços', icone: 'cadastros' },
]

const CHAVES_FIXAS = ['inicio', 'diarios', 'efetivo', 'pendencias']

export default function AppCampo({ perfil, onSair }) {
  const desktop = useDesktop()
  const dados = useDados()
  const [pilha, setPilha] = useState([{ screen: 'inicio', params: {} }])
  const rota = pilha[pilha.length - 1]

  const goto = useCallback((screen, params = {}) => {
    setPilha((p) => [...p, { screen, params }])
  }, [])

  const voltar = useCallback(() => {
    setPilha((p) => (p.length > 1 ? p.slice(0, -1) : p))
  }, [])

  /* Trocar de aba zera a pilha — é o comportamento que as pessoas
     esperam de uma barra inferior. */
  const irParaAba = (chave, params = {}) => setPilha([{ screen: chave, params }])

  useAbrirQrMaterial(dados, goto)
  useAbrirQrColaborador(dados, goto)

  const cont = contarPendencias(pendenciasGerais(dados.pendencias))

  const itens = TODOS_ITENS.filter((i) => i.chave === 'inicio' || moduloPermitido(perfil, i.chave))
  const abasCelular = [
    ...CHAVES_FIXAS.map((c) => itens.find((i) => i.chave === c)).filter(Boolean),
    { chave: 'mais', rotulo: 'Mais', icone: 'mais' },
  ]
  const noMais = itens.filter((i) => !CHAVES_FIXAS.includes(i.chave))

  /* Um atalho do Início ou um link salvo não passa pela lista de
     itens acima, então chega direto no `goto` — segunda trava, além
     do menu escondido. */
  const MODULO_DA_TELA = { diario: 'diarios', consultaColaborador: 'seguranca' }
  const chaveDoModulo = MODULO_DA_TELA[rota.screen] || rota.screen
  const permitido = ['inicio', 'mais'].includes(chaveDoModulo) || moduloPermitido(perfil, chaveDoModulo)

  let corpo
  if (!permitido) {
    corpo = (
      <div className="page">
        <div className="empty" style={{ paddingTop: 80 }}>
          Você não tem acesso a este módulo.
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => irParaAba('inicio')}>Voltar ao início</button>
          </div>
        </div>
      </div>
    )
  } else switch (rota.screen) {
    case 'inicio':       corpo = <InicioCampo goto={goto} irParaAba={irParaAba} perfil={perfil} />; break
    case 'diarios':      corpo = <Diarios goto={goto} perfil={perfil} />; break
    case 'diario':       corpo = <DiarioEditor {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'efetivo':      corpo = <Efetivo goto={goto} perfil={perfil} />; break
    case 'pendencias':   corpo = <Pendencias goto={goto} perfil={perfil} params={rota.params} />; break
    case 'planejamento': corpo = <Planejamento goto={goto} perfil={perfil} params={rota.params} />; break
    case 'galeria':      corpo = <Galeria perfil={perfil} />; break
    case 'lembretes':    corpo = <Lembretes perfil={perfil} />; break
    case 'equipamentos': corpo = <Almoxarifado voltar={voltar} perfil={perfil} params={rota.params} />; break
    case 'seguranca':    corpo = <Seguranca voltar={voltar} perfil={perfil} params={rota.params} />; break
    case 'projetos':     corpo = <Projetos goto={goto} voltar={voltar} perfil={perfil} />; break
    case 'suprimentos':  corpo = <Suprimentos voltar={voltar} perfil={perfil} />; break
    case 'contratos':    corpo = <Contratos voltar={voltar} perfil={perfil} />; break
    case 'producao':     corpo = <Producao voltar={voltar} perfil={perfil} params={rota.params} />; break
    case 'cadastros':    corpo = <Cadastros voltar={voltar} perfil={perfil} />; break
    case 'consultaColaborador': corpo = <ConsultaColaborador voltar={voltar} params={rota.params} />; break
    case 'mais':         corpo = <Mais itens={noMais} irParaAba={irParaAba} perfil={perfil} onSair={onSair} />; break
    default:             corpo = <InicioCampo goto={goto} irParaAba={irParaAba} perfil={perfil} />
  }

  return (
    <div className="app" data-desktop={desktop ? '1' : '0'}>
      <nav className="sidebar" aria-label="Menu">
        <MarcaLateral obra={dados.obra.nome} />
        {itens.map((i) => (
          <button
            key={i.chave} onClick={() => irParaAba(i.chave)}
            aria-current={rota.screen === i.chave ? 'true' : undefined}
          >
            <Icon name={i.icone} size={19} />
            {i.rotulo}
            {i.chave === 'pendencias' && cont.atrasadas > 0 && (
              <span className="badge">{cont.atrasadas}</span>
            )}
          </button>
        ))}
        <div style={{ marginTop: 'auto' }}>
          <RodapeLateral perfil={perfil} onSair={onSair} />
        </div>
      </nav>

      <div className="app-body">{corpo}</div>

      <SinoNotificacoesPush />
      <ChatBot />
      <AvisoAbrirPeloIcone />
      <BarraErro mensagem={dados.erro} />

      <nav className="bottom-nav" aria-label="Navegação principal">
        {abasCelular.map((a) => (
          <button
            key={a.chave} onClick={() => irParaAba(a.chave)}
            aria-current={rota.screen === a.chave ? 'true' : undefined}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={a.icone} size={21} />
              {a.chave === 'pendencias' && cont.atrasadas > 0 && (
                <span
                  style={{
                    position: 'absolute', top: -4, right: -7, minWidth: 8, height: 8,
                    borderRadius: 999, background: 'var(--danger)',
                  }}
                />
              )}
            </span>
            {a.rotulo}
          </button>
        ))}
      </nav>
    </div>
  )
}

export function MarcaLateral({ obra }) {
  const { obras, obra: atual, trocarObra } = useDados()
  return (
    <div style={{ padding: '4px 12px 18px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-graphite)' }}>
        Prumo<span style={{ color: 'var(--primary)' }}>.</span>
      </div>
      {obras.length > 1 ? (
        <div style={{ marginTop: 10 }}>
          <SeletorObra obras={obras} obraId={atual.id} onTrocar={trocarObra} escuro />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--on-graphite-2)', marginTop: 2 }}>{obra}</div>
      )}
    </div>
  )
}

export function RodapeLateral({ perfil, onSair }) {
  return (
    <div style={{ borderTop: '1px solid var(--graphite-3)', paddingTop: 10, marginTop: 10 }}>
      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ fontSize: 13, color: 'var(--on-graphite)', fontWeight: 600 }}>{perfil.nome}</div>
        <div style={{ fontSize: 11, color: 'var(--on-graphite-2)' }}>{perfil.cargo}</div>
      </div>
      <button onClick={onSair}>
        <Icon name="sair" size={19} /> Sair
      </button>
    </div>
  )
}

/* ── Aba "Mais": o que não coube na barra inferior ───────── */

function Mais({ itens, irParaAba, perfil, onSair }) {
  const { obra, org } = useDados()
  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Mais</div>
          <div className="sub">{obra.nome} · {org.nome}</div>
        </div>
      </div>
      <div className="page stack-2">
        {itens.map((i) => (
          <button key={i.chave} className="card-tap" onClick={() => irParaAba(i.chave)}>
            <div className="row-flex">
              <Icon name={i.icone} size={22} style={{ color: 'var(--primary)' }} />
              <div className="grow">
                <div className="t-strong">{i.rotulo}</div>
                <div className="t-caption">{i.desc}</div>
              </div>
              <Icon name="avancar" size={18} style={{ color: 'var(--text-3)' }} />
            </div>
          </button>
        ))}

        <div className="card-flat">
          <div className="t-micro" style={{ marginBottom: 6 }}>Conta</div>
          <div className="t-strong">{perfil.nome}</div>
          <div className="t-caption">{perfil.email} · {perfil.cargo}</div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onSair}>
            <Icon name="sair" size={18} /> Sair
          </button>
        </div>
      </div>
    </>
  )
}
