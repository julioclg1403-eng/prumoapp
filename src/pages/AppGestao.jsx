/* ============================================================
   CASCA DO PERFIL DE GESTÃO — engenharia, coordenação, admin.
   Desktop completo (menu lateral), mas continua funcionando no
   celular pela barra inferior. O admin recebe um item a mais:
   Usuários. Ele é o único que cria conta para os outros.
   ============================================================ */

import { useState, useCallback } from 'react'
import { Icon, useDesktop, BarraErro } from '../components'
import { useDados } from '../lib/DadosContext'
import { contarPendencias, pendenciasGerais, pendentesDeRevisao, contarRequisicoes } from '../lib/dominio'
import { MarcaLateral, RodapeLateral } from './AppCampo'

import InicioGestao from '../screens/inicio-gestao'
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
import Usuarios from '../screens/usuarios'

export default function AppGestao({ perfil, onSair }) {
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

  const irParaAba = (chave) => setPilha([{ screen: chave, params: {} }])

  const cont = contarPendencias(pendenciasGerais(dados.pendencias))
  const revisoes = pendentesDeRevisao(dados.colaboradores).length
  const contPedidos = contarRequisicoes(dados.requisicoes, perfil.id)

  const itens = [
    { chave: 'inicio', rotulo: 'Início', icone: 'inicio' },
    { chave: 'diarios', rotulo: 'Diários', icone: 'diario' },
    { chave: 'planejamento', rotulo: 'Planejamento', icone: 'planejamento',
      desc: 'A semana da obra e o fechamento' },
    { chave: 'cronograma', rotulo: 'Cronograma', icone: 'cronograma',
      desc: 'Avanço físico da obra, etapa a etapa' },
    { chave: 'efetivo', rotulo: 'Efetivo', icone: 'efetivo', badge: revisoes,
      desc: 'Consolidado das presenças e revisão de cadastros' },
    { chave: 'pendencias', rotulo: 'Pendências', icone: 'pendencias', badge: cont.atrasadas },
    { chave: 'requisicoes', rotulo: 'Pedidos', icone: 'pedidos', badge: contPedidos.aguardando,
      desc: 'Requisições de material, da cotação à entrega' },
    { chave: 'galeria', rotulo: 'Galeria', icone: 'galeria',
      desc: 'Todas as fotos da obra, por dia' },
    { chave: 'cadastros', rotulo: 'Cadastros', icone: 'cadastros',
      desc: 'Empresas, colaboradores, locais e serviços' },
    ...(perfil.role === 'admin'
      ? [{ chave: 'usuarios', rotulo: 'Usuários', icone: 'usuarios', desc: 'Quem tem acesso e com qual perfil' }]
      : []),
  ]

  /* A barra inferior do celular só comporta cinco destinos, e a
     gestão tem sete ou oito. Os quatro mais usados no dia a dia
     ficam fixos; o resto vai para "Mais".
     Antes disto, Galeria e Cadastros simplesmente NÃO existiam no
     celular para o perfil de gestão — não havia como chegar neles. */
  const CHAVES_FIXAS = ['inicio', 'diarios', 'efetivo', 'pendencias']
  const abasCelular = [
    ...CHAVES_FIXAS.map((c) => itens.find((i) => i.chave === c)).filter(Boolean),
    { chave: 'mais', rotulo: 'Mais', icone: 'mais' },
  ]
  const noMais = itens.filter((i) => !CHAVES_FIXAS.includes(i.chave))

  let corpo
  switch (rota.screen) {
    case 'inicio':     corpo = <InicioGestao goto={goto} irParaAba={irParaAba} perfil={perfil} />; break
    case 'diarios':    corpo = <Diarios goto={goto} perfil={perfil} />; break
    case 'diario':     corpo = <DiarioEditor {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'efetivo':    corpo = <Efetivo goto={goto} perfil={perfil} params={rota.params} />; break
    case 'pendencias': corpo = <Pendencias goto={goto} perfil={perfil} params={rota.params} />; break
    case 'planejamento': corpo = <Planejamento goto={goto} perfil={perfil} />; break
    case 'cronograma': corpo = <Cronograma perfil={perfil} />; break
    case 'requisicoes': corpo = <Requisicoes goto={goto} perfil={perfil} />; break
    case 'requisicao':  corpo = <Requisicao {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'galeria':    corpo = <Galeria perfil={perfil} />; break
    case 'cadastros':  corpo = <Cadastros voltar={pilha.length > 1 ? voltar : null} perfil={perfil} params={rota.params} />; break
    case 'usuarios':   corpo = <Usuarios voltar={pilha.length > 1 ? voltar : null} perfil={perfil} />; break
    case 'mais':       corpo = <Mais itens={noMais} irParaAba={irParaAba} perfil={perfil} onSair={onSair} />; break
    default:           corpo = <InicioGestao goto={goto} irParaAba={irParaAba} perfil={perfil} />
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
            {i.badge > 0 && <span className="badge">{i.badge}</span>}
          </button>
        ))}
        <div style={{ marginTop: 'auto' }}>
          <RodapeLateral perfil={perfil} onSair={onSair} />
        </div>
      </nav>

      <div className="app-body">{corpo}</div>

      <BarraErro mensagem={dados.erro} />

      <nav className="bottom-nav" aria-label="Navegação principal">
        {abasCelular.map((i) => (
          <button
            key={i.chave} onClick={() => irParaAba(i.chave)}
            aria-current={rota.screen === i.chave ? 'true' : undefined}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={i.icone} size={21} />
              {i.badge > 0 && (
                <span
                  style={{
                    position: 'absolute', top: -4, right: -7, width: 8, height: 8,
                    borderRadius: 999, background: 'var(--danger)',
                  }}
                />
              )}
            </span>
            {i.rotulo}
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ── Aba "Mais": o que não coube na barra inferior ─────────
   Só aparece no celular. Em tela larga tudo está no menu lateral. */

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
                {i.desc && <div className="t-caption">{i.desc}</div>}
              </div>
              {i.badge > 0 && <span className="chip danger">{i.badge}</span>}
              <Icon name="avancar" size={18} style={{ color: 'var(--text-3)' }} />
            </div>
          </button>
        ))}

        <div className="card-flat">
          <div className="t-micro" style={{ marginBottom: 6 }}>Conta</div>
          <div className="t-strong">{perfil.nome}</div>
          <div className="t-caption">{perfil.email}{perfil.cargo ? ` · ${perfil.cargo}` : ''}</div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onSair}>
            <Icon name="sair" size={18} /> Sair
          </button>
        </div>
      </div>
    </>
  )
}
