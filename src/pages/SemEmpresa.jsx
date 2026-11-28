/* ============================================================
   CONTA SEM EMPRESA — não abre obra por conta própria: o acesso é
   só por convite. Se houver convite para o e-mail desta conta (já
   confirmado), a pessoa aceita aqui. Sem empresa, o banco não
   entrega dado nenhum.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react'
import { APP_NOME } from '../lib/config'
import { meusConvites, aceitarConvite } from '../lib/convites'

const NOME_DO_PERFIL = { campo: 'Campo', gestao: 'Gestão', admin: 'Admin' }

export default function SemEmpresa({ perfil, onEntrou, onSair }) {
  const [convites, setConvites] = useState([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const procurar = useCallback(async () => {
    const { data, error } = await meusConvites()
    if (error) { console.error('[Prumo] convites:', error); return }
    setConvites(data || [])
  }, [])
  useEffect(() => { procurar() }, [procurar])

  const aceitar = async (id) => {
    setErro('')
    setOcupado(true)
    const { error } = await aceitarConvite(id)
    setOcupado(false)
    if (error) { setErro(error.message); return }
    onEntrou()
  }

  const verificar = async () => {
    setOcupado(true)
    onEntrou() // relê o perfil: se já entrou numa empresa, o app abre
    await procurar()
    setOcupado(false)
  }

  return (
    <div className="app">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--graphite)' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-graphite)' }}>
              {APP_NOME}<span style={{ color: 'var(--primary)' }}>.</span>
            </div>
            <div style={{ color: 'var(--on-graphite-2)', fontSize: 14, marginTop: 4 }}>
              {perfil?.nome ? `Olá, ${perfil.nome}.` : 'Olá.'}
            </div>
          </div>

          {convites.map((c) => (
            <div key={c.id} className="card" style={{ marginBottom: 14 }}>
              <div className="t-strong" style={{ fontSize: 16 }}>Convite de {c.empresa}</div>
              <div className="t-caption" style={{ margin: '4px 0 12px' }}>
                Perfil de acesso: {NOME_DO_PERFIL[c.papel] || c.papel}. Aceite só se você conhece essa empresa.
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => aceitar(c.id)} disabled={ocupado}>
                Aceitar e entrar
              </button>
            </div>
          ))}
          {erro && <div className="alert danger" style={{ marginBottom: 14 }}>{erro}</div>}

          {convites.length === 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="t-caption" style={{ lineHeight: 1.6 }}>
                Esta conta não está em nenhuma empresa. O acesso é só por convite: peça um ao administrador da obra.
              </div>
            </div>
          )}

          <button type="button" className="btn btn-secondary btn-block" onClick={verificar} disabled={ocupado}>
            Verificar de novo
          </button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8, color: 'var(--on-graphite-2)' }} onClick={onSair}>
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
