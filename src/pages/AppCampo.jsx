/* ============================================================
   CASCA DO PERFIL DE CAMPO — mestre de obras, encarregado.
   Pensada para o celular no canteiro: barra inferior com cinco
   destinos, botões grandes, poucos passos.

   Navegação por ESTADO, não por URL (sem React Router): a tela
   atual é uma variável; `goto` troca de tela. `voltar` mantém uma
   pilha própria para o botão voltar do cabeçalho funcionar.
   ============================================================ */

import { useState, useCallback } from 'react'
import { Icon, useDesktop, BarraErro, SeletorObra } from '../components'
import { useDados } from '../lib/DadosContext'
import { contarPendencias } from '../lib/dominio'

import InicioCampo from '../screens/inicio-campo'
import Diarios from '../screens/diarios'
import DiarioEditor from '../screens/diario-editor'
import Efetivo from '../screens/efetivo'
import Pendencias from '../screens/pendencias'
import Cadastros from '../screens/cadastros'
import Galeria from '../screens/galeria'
import Planejamento from '../screens/planejamento'
import Cronograma from '../screens/cronograma'
import Requisicoes from '../screens/requisicoes'
import Requisicao from '../screens/requisicao'

const ABAS = [
  { chave: 'inicio', rotulo: 'Início', icone: 'inicio' },
  { chave: 'diarios', rotulo: 'Diário', icone: 'diario' },
  { chave: 'efetivo', rotulo: 'Efetivo', icone: 'efetivo' },
  { chave: 'pendencias', rotulo: 'Pendências', icone: 'pendencias' },
  { chave: 'mais', rotulo: 'Mais', icone: 'mais' },
]

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
  const irParaAba = (chave) => setPilha([{ screen: chave, params: {} }])

  const cont = contarPendencias(dados.pendencias)

  let corpo
  switch (rota.screen) {
    case 'inicio':       corpo = <InicioCampo goto={goto} irParaAba={irParaAba} perfil={perfil} />; break
    case 'diarios':      corpo = <Diarios goto={goto} perfil={perfil} />; break
    case 'diario':       corpo = <DiarioEditor {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'efetivo':      corpo = <Efetivo goto={goto} perfil={perfil} />; break
    case 'pendencias':   corpo = <Pendencias goto={goto} perfil={perfil} params={rota.params} />; break
    case 'planejamento': corpo = <Planejamento goto={goto} perfil={perfil} />; break
    case 'cronograma':   corpo = <Cronograma perfil={perfil} />; break
    case 'requisicoes':  corpo = <Requisicoes goto={goto} perfil={perfil} />; break
    case 'requisicao':   corpo = <Requisicao {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'galeria':      corpo = <Galeria perfil={perfil} />; break
    case 'cadastros':    corpo = <Cadastros voltar={voltar} perfil={perfil} />; break
    case 'mais':         corpo = <Mais goto={goto} perfil={perfil} onSair={onSair} />; break
    default:             corpo = <InicioCampo goto={goto} irParaAba={irParaAba} perfil={perfil} />
  }

  return (
    <div className="app" data-desktop={desktop ? '1' : '0'}>
      <nav className="sidebar" aria-label="Menu">
        <MarcaLateral obra={dados.obra.nome} />
        {ABAS.filter((a) => a.chave !== 'mais').map((a) => (
          <button
            key={a.chave} onClick={() => irParaAba(a.chave)}
            aria-current={rota.screen === a.chave ? 'true' : undefined}
          >
            <Icon name={a.icone} size={19} />
            {a.rotulo}
            {a.chave === 'pendencias' && cont.atrasadas > 0 && (
              <span className="badge">{cont.atrasadas}</span>
            )}
          </button>
        ))}
        <button onClick={() => irParaAba('planejamento')} aria-current={rota.screen === 'planejamento' ? 'true' : undefined}>
          <Icon name="planejamento" size={19} /> Planejamento
        </button>
        <button onClick={() => irParaAba('cronograma')} aria-current={rota.screen === 'cronograma' ? 'true' : undefined}>
          <Icon name="cronograma" size={19} /> Cronograma
        </button>
        <button onClick={() => irParaAba('requisicoes')} aria-current={rota.screen === 'requisicoes' ? 'true' : undefined}>
          <Icon name="pedidos" size={19} /> Pedidos
        </button>
        <button onClick={() => irParaAba('galeria')} aria-current={rota.screen === 'galeria' ? 'true' : undefined}>
          <Icon name="galeria" size={19} /> Galeria
        </button>
        <button onClick={() => irParaAba('cadastros')} aria-current={rota.screen === 'cadastros' ? 'true' : undefined}>
          <Icon name="cadastros" size={19} /> Cadastros
        </button>
        <div style={{ marginTop: 'auto' }}>
          <RodapeLateral perfil={perfil} onSair={onSair} />
        </div>
      </nav>

      <div className="app-body">{corpo}</div>

      <BarraErro mensagem={dados.erro} />

      <nav className="bottom-nav" aria-label="Navegação principal">
        {ABAS.map((a) => (
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

function Mais({ goto, perfil, onSair }) {
  const { obra, org } = useDados()
  const itens = [
    { chave: 'requisicoes', rotulo: 'Pedidos de material', desc: 'Pedir material e conferir o que está chegando', icone: 'pedidos' },
    { chave: 'planejamento', rotulo: 'Planejamento', desc: 'O que está previsto para a semana', icone: 'planejamento' },
    { chave: 'cronograma', rotulo: 'Cronograma', desc: 'O avanço físico da obra, etapa a etapa', icone: 'cronograma' },
    { chave: 'galeria', rotulo: 'Galeria', desc: 'Todas as fotos da obra, por dia', icone: 'galeria' },
    { chave: 'cadastros', rotulo: 'Cadastros', desc: 'Empresas, colaboradores, locais e serviços', icone: 'cadastros' },
  ]
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
          <button key={i.chave} className="card-tap" onClick={() => goto(i.chave)}>
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
