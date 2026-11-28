/* ============================================================
   CRIAR SENHA NOVA — aparece para quem abriu o link de
   "esqueci minha senha". Sem esta tela, o link só abria o app e
   a senha antiga continuava valendo.
   ============================================================ */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'

const SENHA_MINIMA = 8

export default function NovaSenha({ email, onPronto }) {
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const salvar = async (e) => {
    e.preventDefault()
    setErro('')
    if (senha.length < SENHA_MINIMA) { setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`); return }
    if (senha !== repetida) { setErro('As duas senhas estão diferentes.'); return }
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) { setErro(`Não consegui salvar a senha. ${error.message}`); return }
    onPronto()
  }

  return (
    <div className="app">
      <div className="page" style={{ paddingTop: 60, maxWidth: 420 }}>
        <form className="card stack-2" onSubmit={salvar}>
          <div className="t-title">Criar uma senha nova</div>
          <div className="t-caption" style={{ overflowWrap: 'anywhere' }}>Conta: {email}</div>
          <Campo label="Senha nova" dica={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
            <input className="ipt" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <Campo label="Repita a senha">
            <input className="ipt" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
          </Campo>
          {erro && <div className="alert danger">{erro}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar senha'}
          </button>
          <button className="btn btn-ghost btn-block" type="button" onClick={onPronto}>Agora não</button>
        </form>
      </div>
    </div>
  )
}
