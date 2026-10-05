import React, { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { getAuthErrorMessage, requestPasswordReset, updateRecoveredPassword } from './services/authApi'

function Shell({ title, children, navigate }) {
  return (
    <section className="standalone-page">
      <div className="page-card">
        <div className="page-titlebar"><div><button className="page-back" onClick={()=>navigate('/entrar')}>← Voltar</button><h1>{title}</h1></div></div>
        {children}
      </div>
    </section>
  )
}

export function PasswordRecoveryPage({ mode='request', session, navigate, notify }) {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')

  async function request(event) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await requestPasswordReset(email.trim())
      setMessage('Se existir uma conta com este e-mail, você receberá um link seguro para redefinir a senha.')
    } catch (e) { setError(getAuthErrorMessage(e)) }
    finally { setBusy(false) }
  }

  async function reset(event) {
    event.preventDefault()
    setError('')
    if (password.length < 10) return setError('Use pelo menos 10 caracteres na nova senha.')
    if (password !== confirm) return setError('As senhas não coincidem.')
    setBusy(true)
    try {
      await updateRecoveredPassword(password)
      notify?.('Senha atualizada com sucesso.')
      navigate('/conta/seguranca')
    } catch (e) { setError(getAuthErrorMessage(e)) }
    finally { setBusy(false) }
  }

  if (mode==='reset') {
    return (
      <Shell title="Criar nova senha" navigate={navigate}>
        <form className="panel-content auth-form standalone-auth-form" onSubmit={reset}>
          {!session && <p className="recovery-note">Abra esta página pelo link enviado ao seu e-mail para autorizar a troca de senha.</p>}
          <label>Nova senha<input type="password" minLength={10} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label>
          <label>Confirmar nova senha<input type="password" minLength={10} required value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="action primary-action" disabled={busy || !session}><KeyRound/>{busy?'Atualizando...':'Atualizar senha'}</button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell title="Recuperar acesso" navigate={navigate}>
      <form className="panel-content auth-form standalone-auth-form" onSubmit={request}>
        <p className="recovery-note">Informe o e-mail da sua conta CreativeZone. Enviaremos um link temporário pelo Resend.</p>
        <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
        {message && <p className="recovery-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
        <button className="action primary-action" disabled={busy}><Mail/>{busy?'Enviando...':'Enviar link de recuperação'}</button>
      </form>
    </Shell>
  )
}
