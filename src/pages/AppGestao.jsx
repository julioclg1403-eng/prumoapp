/* ============================================================
   CASCA DO PERFIL DE GESTÃO — engenharia, coordenação, admin.
   Desktop completo (menu lateral), mas continua funcionando no
   celular pela barra inferior. O admin recebe um item a mais:
   Usuários. Ele é o único que cria conta para os outros.
   ============================================================ */

import { useState, useCallback } from 'react'
import { Icon, useDesktop, BarraErro } from '../components'
import { useDados } from '../lib/DadosContext'
import { contarPendencias, pendentesDeRevisao } from '../lib/dominio'
import { MarcaLateral, RodapeLateral } from './AppCampo'

import InicioGestao from '../screens/inicio-gestao'
import Diarios from '../screens/diarios'
import DiarioEditor from '../screens/diario-editor'
import Efetivo from '../screens/efetivo'
import Pendencias from '../screens/pendencias'
import Cadastros from '../screens/cadastros'
import Galeria from '../screens/galeria'
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

  const cont = contarPendencias(dados.pendencias)
  const revisoes = pendentesDeRevisao(dados.colaboradores).length

  const itens = [
    { chave: 'inicio', rotulo: 'Início', icone: 'inicio' },
    { chave: 'diarios', rotulo: 'Diários', icone: 'diario' },
    { chave: 'efetivo', rotulo: 'Efetivo', icone: 'efetivo', badge: revisoes },
    { chave: 'pendencias', rotulo: 'Pendências', icone: 'pendencias', badge: cont.atrasadas },
    { chave: 'galeria', rotulo: 'Galeria', icone: 'galeria' },
    { chave: 'cadastros', rotulo: 'Cadastros', icone: 'cadastros' },
    ...(perfil.role === 'admin' ? [{ chave: 'usuarios', rotulo: 'Usuários', icone: 'usuarios' }] : []),
  ]

  /* No celular a barra inferior só comporta cinco. O que sobra
     continua acessível pelo menu lateral em tela larga e, no
     celular, pelos atalhos do Início. */
  const abasCelular = itens.slice(0, 5)

  let corpo
  switch (rota.screen) {
    case 'inicio':     corpo = <InicioGestao goto={goto} irParaAba={irParaAba} perfil={perfil} />; break
    case 'diarios':    corpo = <Diarios goto={goto} perfil={perfil} />; break
    case 'diario':     corpo = <DiarioEditor {...rota.params} voltar={voltar} perfil={perfil} />; break
    case 'efetivo':    corpo = <Efetivo goto={goto} perfil={perfil} params={rota.params} />; break
    case 'pendencias': corpo = <Pendencias goto={goto} perfil={perfil} params={rota.params} />; break
    case 'galeria':    corpo = <Galeria perfil={perfil} />; break
    case 'cadastros':  corpo = <Cadastros voltar={pilha.length > 1 ? voltar : null} perfil={perfil} params={rota.params} />; break
    case 'usuarios':   corpo = <Usuarios voltar={pilha.length > 1 ? voltar : null} perfil={perfil} />; break
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
