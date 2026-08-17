/* ============================================================
   CASCA DO PERFIL DE GESTÃO — engenharia, coordenação, admin.
   Desktop completo (menu lateral), mas continua funcionando no
   celular pela barra inferior. O admin recebe um item a mais:
   Usuários. Ele é o único que cria conta para os outros.
   ============================================================ */

import { useState, useCallback } from 'react'
import { Icon, useDesktop, BarraErro } from '../components'
import { useDados } from '../lib/DadosContext'
import { useAbrirQrMaterial } from '../lib/useAbrirQrMaterial'
import {
  contarPendencias, pendenciasGerais, pendentesDeRevisao, contarRequisicoes, situacaoLembrete,
} from '../lib/dominio'
import { MarcaLateral, RodapeLateral } from './AppCampo'

import InicioGestao from '../screens/inicio-gestao'
import Diarios from '../screens/diarios'
import DiarioEditor from '../screens/diario-editor'
import Efetivo from '../screens/efetivo'
import Pendencias from '../screens/pendencias'
import Cadastros from '../screens/cadastros'
import Galeria from '../screens/galeria'
import Planejamento from '../screens/planejamento'
import Requisicoes from '../screens/requisicoes'
import Requisicao from '../screens/requisicao'
import Lembretes from '../screens/lembretes'
import Almoxarifado from '../screens/almoxarifado'
import Seguranca from '../screens/seguranca'
import Projetos from '../screens/projetos'
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

  const irParaAba = (chave, params = {}) => setPilha([{ screen: chave, params }])

  useAbrirQrMaterial(dados, goto)

  const cont = contarPendencias(pendenciasGerais(dados.pendencias))
  const revisoes = pendentesDeRevisao(dados.colaboradores).length
  const contPedidos = contarRequisicoes(dados.requisicoes, perfil.id)
  const lembretesAtrasados = dados.lembretes.filter(
    (l) => l.destinatario_id === perfil.id && situacaoLembrete(l).chave === 'atrasado',
  ).length

  const itens = [
    { chave: 'inicio', rotulo: 'Início', icone: 'inicio' },
    { chave: 'diarios', rotulo: 'Diários', icone: 'diario' },
    { chave: 'planejamento', rotulo: 'Planejamento', icone: 'planejamento',
      desc: 'A semana da obra, o fechamento e o avanço físico por etapa' },
    { chave: 'efetivo', rotulo: 'Efetivo', icone: 'efetivo', badge: revisoes,
      desc: 'Consolidado das presenças e revisão de cadastros' },
    { chave: 'pendencias', rotulo: 'Pendências', icone: 'pendencias', badge: cont.atrasadas },
    { chave: 'requisicoes', rotulo: 'Pedidos', icone: 'pedidos', badge: contPedidos.aguardando,
      desc: 'Requisições de material, da cotação à entrega' },
    { chave: 'galeria', rotulo: 'Galeria', icone: 'galeria',
      desc: 'Todas as fotos da obra, por dia' },
    { chave: 'lembretes', rotulo: 'Lembretes', icone: 'lembrete', badge: lembretesAtrasados,
      desc: 'O que você marcou pra não esquecer' },
    { chave: 'equipamentos', rotulo: 'Almoxarifado', icone: 'equipamento',
      desc: 'Máquinas e ferramentas, e onde cada uma está' },
    { chave: 'seguranca', rotulo: 'Segurança', icone: 'alerta',
      desc: 'Ocorrências e advertências da obra' },
    { chave: 'cadastros', rotulo: 'Cadastros', icone: 'cadastros',
      desc: 'Empresas, colaboradores, locais e serviços' },
    { chave: 'projetos', rotulo: 'Projetos', icone: 'projeto',
      desc: 'Apontamentos entre projeto e obra, por disciplina' },
    /* Usuários é admin-only por papel, não por módulo liberável —
       só quem já é admin cria/edita acesso de outra pessoa. Projetos
       já foi assim também; agora segue a mesma lista de módulos
       restringíveis que todo o resto (banco, RLS `tem_modulo`,
       concorda). */
    ...(perfil.role === 'admin'
      ? [{ chave: 'usuarios', rotulo: 'Usuários', icone: 'usuarios', desc: 'Quem tem acesso e com qual perfil' }]
      : []),
  ].filter((i) => (
    /* "Início" e "Usuários" nunca são restringíveis por essa lista —
       Início porque sem ele não sobra pra onde cair, Usuários porque
       já é admin-only por papel. Admin também nunca é restringido:
       é quem restringe os outros, em Usuários. */
    i.chave === 'inicio' || i.chave === 'usuarios' || perfil.role === 'admin'
      || !perfil.modulos_permitidos || perfil.modulos_permitidos.includes(i.chave)
  ))

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

  /* Segunda trava, além do menu escondido: um atalho do Início (ex.
     "Abrir efetivo") ou um link salvo não passam pela lista de itens
     acima, então chegam direto no `goto`. `diario`/`requisicao` são
     telas de detalhe sem entrada própria no menu — herdam a permissão
     do módulo que as abre. */
  const MODULO_DA_TELA = { diario: 'diarios', requisicao: 'requisicoes' }
  const chaveDoModulo = MODULO_DA_TELA[rota.screen] || rota.screen
  /* Usuários é admin-only de verdade — não passa pela lista de
     módulos restringíveis, vira "sim" só pra quem é admin. Projetos
     não está mais aqui: segue a mesma regra dos outros módulos
     (bloco de baixo). */
  const ADMIN_ONLY = ['usuarios']
  const semRestricao = perfil.role === 'admin' || !perfil.modulos_permitidos
  const permitido = ['inicio', 'mais'].includes(chaveDoModulo) || (
    ADMIN_ONLY.includes(chaveDoModulo)
      ? perfil.role === 'admin'
      : semRestricao || perfil.modulos_permitidos.includes(chaveDoModulo)
  )

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
    case 'inicio':     corpo = <InicioGestao goto={goto} irParaAba={irParaAba} perfil={perfil} />; break
    case 'diarios':    corpo = <Diarios goto={goto} perfil={perfil} />; break
    case 'diario':     corpo = <DiarioEditor {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'efetivo':    corpo = <Efetivo goto={goto} perfil={perfil} params={rota.params} />; break
    case 'pendencias': corpo = <Pendencias goto={goto} perfil={perfil} params={rota.params} />; break
    case 'planejamento': corpo = <Planejamento goto={goto} perfil={perfil} params={rota.params} />; break
    case 'requisicoes': corpo = <Requisicoes goto={goto} perfil={perfil} />; break
    case 'requisicao':  corpo = <Requisicao {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'galeria':    corpo = <Galeria perfil={perfil} />; break
    case 'lembretes':  corpo = <Lembretes perfil={perfil} />; break
    case 'equipamentos': corpo = <Almoxarifado voltar={pilha.length > 1 ? voltar : null} perfil={perfil} params={rota.params} />; break
    case 'seguranca':  corpo = <Seguranca voltar={pilha.length > 1 ? voltar : null} perfil={perfil} />; break
    case 'projetos':   corpo = <Projetos goto={goto} voltar={pilha.length > 1 ? voltar : null} perfil={perfil} />; break
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
