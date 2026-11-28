/* ============================================================
   LINK DE ACESSO — convite ou troca de senha liberada. Nome e
   e-mail vêm do banco e não mudam; a pessoa só cria a senha e
   já entra.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_NOME } from '../lib/config'
import { Campo } from '../components'
import { verLink, usarLink, esquecerLink } from '../lib/linkConvite'

const NOME_DO_PERFIL = { campo: 'Campo', gestao: 'Gestão' }
const SENHA_MINIMA = 8

const TEXTOS = {
  convite: {
    subtitulo: 'Convite de acesso',
    conferindo: 'Conferindo o convite…',
    semResposta: 'Não consegui conferir o convite. Confira a internet.',
    campoSenha: 'Crie a sua senha',
    botao: 'Criar senha e entrar',
    criado: 'O seu acesso foi criado.',
    naoEVoce: 'Se este não é o seu nome, não use o convite e avise quem enviou.',
    naoVale: {
      usado: 'Este convite já foi usado. Se foi você, é só entrar com o seu e-mail e senha.',
      vencido: 'Este convite venceu. Peça um novo ao administrador.',
      invalido: 'Este convite não vale mais. Peça um novo ao administrador.',
    },
  },
  senha: {
    subtitulo: 'Troca de senha',
    conferindo: 'Conferindo o link…',
    semResposta: 'Não consegui conferir o link. Confira a internet.',
    campoSenha: 'Senha nova',
    botao: 'Salvar senha e entrar',
    criado: 'A sua senha foi trocada.',
    naoEVoce: 'Se este não é o seu nome, não use o link e avise quem enviou.',
    naoVale: {
      usado: 'Este link já foi usado. Entre com a senha que você criou.',
      vencido: 'Este link venceu. Peça ao administrador para liberar de novo.',
      invalido: 'Este link não vale mais. Peça ao administrador para liberar de novo.',
    },
  },
}

export default function Convite({ tipo, codigo, aoIrParaEntrar }) {
  const textos = TEXTOS[tipo]
  const [convite, setConvite] = useState(null)
  const [semResposta, setSemResposta] = useState(false)
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [criadoSemEntrar, setCriadoSemEntrar] = useState(false)

  const conferir = useCallback(async () => {
    setSemResposta(false)
    const { data, error } = await verLink(tipo, codigo)
    if (error) { console.error('[Prumo] link de acesso:', error); setSemResposta(true); return }
    setConvite(data?.[0] || { situacao: 'invalido' })
  }, [tipo, codigo])
  useEffect(() => { conferir() }, [conferir])

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    if (senha.length < SENHA_MINIMA) { setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`); return }
    if (senha !== repetida) { setErro('As duas senhas estão diferentes.'); return }
    setEnviando(true)
    const r = await usarLink(tipo, codigo, senha)
    if (r.erro) {
      setEnviando(false)
      if (r.situacao) await conferir()
      setErro(r.situacao ? '' : r.erro)
      return
    }
    // some do navegador antes de entrar: senão o app acharia que é um convite ainda por usar
    esquecerLink()
    const entrada = await supabase.auth.signInWithPassword({ email: r.email, password: senha })
    if (entrada.error) { setEnviando(false); setCriadoSemEntrar(true) }
    // deu certo: o App percebe a sessão e abre a obra
  }

  const situacao = convite?.situacao

  return (
    <div className="app">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--graphite)' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-graphite)' }}>
              {APP_NOME}<span style={{ color: 'var(--primary)' }}>.</span>
            </div>
            <div style={{ color: 'var(--on-graphite-2)', fontSize: 14, marginTop: 4 }}>{textos.subtitulo}</div>
          </div>

          {criadoSemEntrar ? (
            <div className="card stack-2">
              <div className="alert success">{textos.criado} Agora entre com o seu e-mail e a senha que você escolheu.</div>
              <button type="button" className="btn btn-primary btn-block" onClick={aoIrParaEntrar}>Ir para entrar</button>
            </div>
          ) : semResposta ? (
            <div className="card stack-2">
              <div className="alert danger">{textos.semResposta}</div>
              <button type="button" className="btn btn-primary btn-block" onClick={conferir}>Tentar de novo</button>
            </div>
          ) : !convite ? (
            <div className="card"><div className="t-caption">{textos.conferindo}</div></div>
          ) : situacao === 'disponivel' ? (
            <form className="card stack-2" onSubmit={enviar}>
              <div>
                <div className="t-strong" style={{ fontSize: 17 }}>{tipo === 'senha' ? 'Criar senha nova' : `Convite de ${convite.empresa}`}</div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {tipo === 'senha' ? convite.empresa : `Perfil de acesso: ${NOME_DO_PERFIL[convite.papel] || convite.papel}`}
                </div>
              </div>
              <Campo label="Nome">
                <input className="ipt" value={convite.nome || ''} readOnly style={{ background: 'var(--surface-2)' }} />
              </Campo>
              <Campo label="E-mail">
                <input className="ipt" type="email" autoComplete="username" value={convite.email || ''} readOnly style={{ background: 'var(--surface-2)' }} />
              </Campo>
              <Campo label={textos.campoSenha} dica={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
                <input className="ipt" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              </Campo>
              <Campo label="Repita a senha">
                <input className="ipt" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
              </Campo>
              {erro && <div className="alert danger">{erro}</div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
                {enviando ? 'Aguarde…' : textos.botao}
              </button>
              <div className="t-caption" style={{ lineHeight: 1.5 }}>
                {textos.naoEVoce}
              </div>
            </form>
          ) : (
            <div className="card stack-2">
              {situacao === 'tem_conta' ? (
                <>
                  <div className="alert info" style={{ lineHeight: 1.5 }}>
                    O e-mail <strong style={{ overflowWrap: 'anywhere' }}>{convite.email}</strong> já tem conta no Prumo.
                  </div>
                  <div className="t-caption" style={{ lineHeight: 1.5 }}>
                    Cada conta fica em uma empresa só. Se a sua ainda não está em nenhuma, entre e aceite o convite.
                    Se já está em outra, peça um convite com um e-mail diferente.
                  </div>
                </>
              ) : (
                <div className="alert danger" style={{ lineHeight: 1.5 }}>{textos.naoVale[situacao] || textos.naoVale.invalido}</div>
              )}
              <button type="button" className="btn btn-primary btn-block" onClick={aoIrParaEntrar}>Ir para entrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
