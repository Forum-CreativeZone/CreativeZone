import React, { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  KeyRound,
  Laptop,
  Mail,
  MonitorSmartphone,
  Palette,
  Power,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import {
  getAuthErrorMessage,
  requestReauthentication,
  signOut,
  signOutOtherSessions,
  updateAccountEmail,
  updateAccountPassword,
} from './services/authApi'
import {
  deleteMyAccount,
  getAccountAuditLog,
  getCurrentDeviceId,
  getDeviceSessions,
  logAccountEvent,
  markOtherDeviceSessionsEnded,
  setAccountActive,
  updateAccountSettings,
} from './services/communityApi'
import {
  canUseWebPush,
  disableWebPush,
  enableWebPush,
  getPushPermissionState,
  isPushEnabledForCurrentDevice,
} from './services/pushApi'
import { sendPushTestNotification } from './services/extendedApi'

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const eventLabels = {
  profile_updated: 'Perfil atualizado',
  avatar_updated: 'Avatar atualizado',
  username_changed: 'Nome de usuário alterado',
  email_change_requested: 'Alteração de e-mail solicitada',
  email_changed: 'E-mail alterado',
  password_changed: 'Senha alterada',
  identity_connected: 'Conta conectada',
  identity_disconnected: 'Conta desconectada',
  other_sessions_revoked: 'Outras sessões encerradas',
  push_enabled: 'Notificações push ativadas',
  push_disabled: 'Notificações push desativadas',
  account_deactivated: 'Conta desativada',
  account_reactivated: 'Conta reativada',
  security_reauth_requested: 'Código de segurança solicitado',
}

export function SecuritySection({ session, profile, setProfile, navigate, notify }) {
  const userId = session?.user?.id
  const [devices, setDevices] = useState([])
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState(session?.user?.email || '')
  const [emailNonce, setEmailNonce] = useState('')
  const [passwordNonce, setPasswordNonce] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')

  async function loadDevices() {
    if (!userId) return
    try {
      setDevices(await getDeviceSessions(userId))
    } catch {}
  }

  useEffect(() => {
    loadDevices()
  }, [userId])

  async function requestCode(kind) {
    setBusy(true)
    try {
      await requestReauthentication()
      await logAccountEvent('security_reauth_requested', { purpose: kind }).catch(() => {})
      notify('Enviamos um código de segurança para o e-mail da sua conta.')
    } catch (error) {
      notify(getAuthErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function changeEmail(event) {
    event.preventDefault()
    if (!email.trim() || email.trim() === session.user.email) {
      return notify('Informe um novo endereço de e-mail.')
    }
    if (!emailNonce.trim()) return notify('Informe o código de segurança enviado por e-mail.')

    setBusy(true)
    try {
      await updateAccountEmail(email.trim(), emailNonce.trim())
      await logAccountEvent('email_change_requested', { new_email: email.trim() }).catch(() => {})
      notify('Alteração solicitada. Confirme o novo endereço no e-mail enviado pelo serviço de autenticação.')
      setEmailNonce('')
    } catch (error) {
      notify(getAuthErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (password.length < 10) return notify('Use uma senha com pelo menos 10 caracteres.')
    if (password !== password2) return notify('As duas senhas não são iguais.')
    if (!passwordNonce.trim()) return notify('Informe o código de segurança enviado por e-mail.')

    setBusy(true)
    try {
      await updateAccountPassword(password, passwordNonce.trim())
      setPassword('')
      setPassword2('')
      setPasswordNonce('')
      notify('Senha alterada com sucesso.')
    } catch (error) {
      notify(getAuthErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function closeOtherSessions() {
    setBusy(true)
    try {
      await signOutOtherSessions()
      await markOtherDeviceSessionsEnded(userId)
      await logAccountEvent('other_sessions_revoked').catch(() => {})
      await loadDevices()
      notify('As outras sessões foram encerradas. Esta sessão permaneceu ativa.')
    } catch (error) {
      notify(error?.message || 'Não foi possível encerrar as outras sessões.')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    if (!confirm('Desativar sua conta temporariamente? Seu perfil ficará oculto até você reativá-la.')) return
    setBusy(true)
    try {
      await setAccountActive(false)
      setProfile((current) => current ? { ...current, account_status: 'deactivated' } : current)
      await signOut()
      navigate('/')
      notify('Sua conta foi desativada. Você pode reativá-la entrando novamente.')
    } catch (error) {
      notify(error?.message || 'Não foi possível desativar a conta.')
    } finally {
      setBusy(false)
    }
  }

  async function reactivate() {
    setBusy(true)
    try {
      await setAccountActive(true)
      setProfile((current) => current ? { ...current, account_status: 'active' } : current)
      notify('Conta reativada.')
      navigate('/')
    } catch (error) {
      notify(error?.message || 'Não foi possível reativar a conta.')
    } finally {
      setBusy(false)
    }
  }

  async function permanentDelete() {
    if (deletePhrase !== 'EXCLUIR MINHA CONTA') {
      return notify('Digite exatamente EXCLUIR MINHA CONTA para confirmar.')
    }
    if (!confirm('Esta ação é permanente. Sua conta será excluída definitivamente. Continuar?')) return

    setBusy(true)
    try {
      await deleteMyAccount(deletePhrase)
      await signOut().catch(() => {})
      navigate('/')
      notify('Conta excluída.')
    } catch (error) {
      if (error?.code === 'reauth_required' || String(error?.message || '').includes('reauth')) {
        notify('Por segurança, saia, entre novamente na conta e repita a exclusão.')
      } else {
        notify(error?.message || 'Não foi possível excluir a conta.')
      }
    } finally {
      setBusy(false)
    }
  }

  const currentDeviceId = getCurrentDeviceId()

  return (
    <div className="advanced-account-section">
      {profile?.account_status === 'deactivated' && (
        <div className="security-card important-card">
          <h2><Power /> Conta desativada</h2>
          <p>Sua conta está desativada e o perfil está oculto.</p>
          <button className="action primary-action" onClick={reactivate} disabled={busy}>Reativar conta</button>
        </div>
      )}

      <form className="security-card account-form" onSubmit={changeEmail}>
        <h2><Mail /> Alterar e-mail</h2>
        <p>Por segurança, solicite um código antes de confirmar a troca.</p>
        <label>E-mail atual<input value={session?.user?.email || ''} disabled /></label>
        <label>Novo e-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <div className="security-inline">
          <label>Código de segurança<input inputMode="numeric" value={emailNonce} onChange={(e) => setEmailNonce(e.target.value)} /></label>
          <button type="button" className="action" onClick={() => requestCode('email')} disabled={busy}>Enviar código</button>
        </div>
        <button className="action primary-action" disabled={busy}>Solicitar alteração de e-mail</button>
      </form>

      <form className="security-card account-form" onSubmit={changePassword}>
        <h2><KeyRound /> Alterar senha</h2>
        <p>A nova senha também será verificada contra bases públicas de senhas vazadas.</p>
        <div className="security-inline">
          <label>Código de segurança<input inputMode="numeric" value={passwordNonce} onChange={(e) => setPasswordNonce(e.target.value)} /></label>
          <button type="button" className="action" onClick={() => requestCode('password')} disabled={busy}>Enviar código</button>
        </div>
        <label>Nova senha<input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Confirmar nova senha<input type="password" minLength={8} required value={password2} onChange={(e) => setPassword2(e.target.value)} /></label>
        <button className="action primary-action" disabled={busy}>Alterar senha</button>
      </form>

      <section className="security-card">
        <h2><MonitorSmartphone /> Sessões e dispositivos</h2>
        <div className="device-list">
          {devices.map((device) => (
            <div key={device.id}>
              {/Celular|Tablet/i.test(device.device_name) ? <Smartphone /> : <Laptop />}
              <span>
                <strong>{device.device_name}</strong>
                <small>
                  {device.device_id === currentDeviceId ? 'Este dispositivo · ' : ''}
                  Última atividade {formatDateTime(device.last_seen_at)}
                  {device.ended_at ? ' · sessão encerrada' : ''}
                </small>
              </span>
            </div>
          ))}
          {!devices.length && <p>Nenhum dispositivo registrado ainda.</p>}
        </div>
        <button className="action" onClick={closeOtherSessions} disabled={busy}>Encerrar todas as outras sessões</button>
      </section>

      <section className="security-card danger-card">
        <h2><Power /> Desativar conta</h2>
        <p>Oculta seu perfil e interrompe notificações. Seu conteúdo permanece e você pode reativar a conta depois.</p>
        {profile?.account_status !== 'deactivated' && (
          <button className="action" onClick={deactivate} disabled={busy}>Desativar temporariamente</button>
        )}
      </section>

      <section className="security-card danger-card">
        <h2><Trash2 /> Excluir conta</h2>
        <p>A exclusão é permanente. Tópicos e respostas são preservados sem vínculo com sua identidade.</p>
        <label className="delete-confirm">
          Digite <strong>EXCLUIR MINHA CONTA</strong>
          <input value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} />
        </label>
        <button className="action danger-action" onClick={permanentDelete} disabled={busy}>Excluir minha conta definitivamente</button>
      </section>
    </div>
  )
}

const notificationRows = [
  ['reply','Respostas aos meus tópicos'],
  ['mention','Menções com @usuário'],
  ['quote','Quando citarem uma publicação minha'],
  ['reaction','Reações recebidas'],
  ['follower','Novos seguidores'],
  ['dm','Mensagens diretas'],
  ['moderation','Avisos da moderação'],
]

export function NotificationPreferencesSection({ userId, settings, setSettings, notify }) {
  const [busy, setBusy] = useState(false)
  const [devicePush, setDevicePush] = useState(false)
  const [permission, setPermission] = useState('default')

  useEffect(() => {
    if (!userId) return
    getPushPermissionState().then(setPermission)
    isPushEnabledForCurrentDevice(userId).then(setDevicePush)
  }, [userId, settings?.push_enabled])

  function patch(field, value) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  async function save() {
    setBusy(true)
    try {
      const payload = {}
      for (const [key] of notificationRows) {
        payload[`inapp_${key}`] = Boolean(settings[`inapp_${key}`])
        payload[`email_${key}`] = Boolean(settings[`email_${key}`])
        payload[`push_${key}`] = Boolean(settings[`push_${key}`])
      }
      payload.email_news = Boolean(settings.email_news)
      payload.push_enabled = Boolean(settings.push_enabled)
      const next = await updateAccountSettings(userId, payload)
      setSettings(next)
      notify('Preferências de notificações salvas.')
    } catch (error) {
      notify(error?.message || 'Não foi possível salvar as preferências.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleNativePush() {
    setBusy(true)
    try {
      if (devicePush) {
        await disableWebPush(userId)
        setDevicePush(false)
        patch('push_enabled', false)
        notify('Notificações nativas desativadas neste dispositivo.')
      } else {
        await enableWebPush(userId)
        setDevicePush(true)
        patch('push_enabled', true)
        setPermission('granted')
        notify('Notificações nativas ativadas neste dispositivo.')
      }
    } catch (error) {
      notify(error?.message || 'Não foi possível configurar as notificações nativas.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="notification-settings">
      <section className="security-card">
        <h2><BellRing /> Notificações nativas no PC e celular</h2>
        <p>
          {canUseWebPush()
            ? 'Receba alertas do navegador mesmo fora da página. No iPhone/iPad, instale a CreativeZone na Tela de Início e permita notificações.'
            : 'Este navegador não oferece suporte ao Web Push.'}
        </p>
        <div className="push-device-actions">
          <button className={'action ' + (devicePush ? '' : 'primary-action')} onClick={toggleNativePush} disabled={busy || !canUseWebPush()}>
            {devicePush ? 'Desativar neste dispositivo' : 'Ativar notificações neste dispositivo'}
          </button>
          {devicePush && (
            <button
              className="action"
              onClick={async () => {
                setBusy(true)
                try {
                  await sendPushTestNotification()
                  notify('Notificação de teste criada. Se o dispositivo estiver inscrito, ela deve aparecer em instantes.')
                } catch (error) {
                  notify(error?.message || 'Não foi possível enviar a notificação de teste.')
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
            >
              Enviar notificação de teste
            </button>
          )}
        </div>
        <small>Permissão atual do navegador: {permission}</small>
      </section>

      <div className="notification-pref-table">
        <div className="pref-header"><span>Evento</span><b>No fórum</b><b>E-mail</b><b>Push</b></div>
        {notificationRows.map(([key,label]) => (
          <div className="pref-row" key={key}>
            <span>{label}</span>
            <input type="checkbox" checked={Boolean(settings[`inapp_${key}`])} onChange={(e) => patch(`inapp_${key}`, e.target.checked)} />
            <input type="checkbox" checked={Boolean(settings[`email_${key}`])} onChange={(e) => patch(`email_${key}`, e.target.checked)} />
            <input type="checkbox" checked={Boolean(settings[`push_${key}`])} onChange={(e) => patch(`push_${key}`, e.target.checked)} />
          </div>
        ))}
        <div className="pref-row">
          <span>Novidades da CreativeZone</span>
          <span>—</span>
          <input type="checkbox" checked={Boolean(settings.email_news)} onChange={(e) => patch('email_news', e.target.checked)} />
          <span>—</span>
        </div>
      </div>
      <button className="action primary-action" onClick={save} disabled={busy}><Save /> Salvar alertas</button>
      <p className="settings-note">As preferências de e-mail já ficam registradas para o sistema de entrega transacional.</p>
    </div>
  )
}

export function AppearanceSection({ userId, settings, setSettings, setAppearance, notify }) {
  const [busy, setBusy] = useState(false)
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const next = await updateAccountSettings(userId, {
        theme: settings.theme,
        density: settings.density,
        language: settings.language,
      })
      setSettings(next)
      const theme = next.theme === 'system'
        ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : next.theme
      setAppearance(theme)
      document.documentElement.dataset.density = next.density
      notify('Configurações de aparência salvas.')
    } catch (error) {
      notify(error?.message || 'Não foi possível salvar a aparência.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="account-form appearance-settings" onSubmit={save}>
      <h2><Palette /> Aparência</h2>
      <label>Tema<select value={settings.theme} onChange={(e) => setSettings((c) => ({ ...c, theme: e.target.value }))}><option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Seguir o sistema</option></select></label>
      <label>Densidade<select value={settings.density} onChange={(e) => setSettings((c) => ({ ...c, density: e.target.value }))}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></select></label>
      <label>Idioma<select value={settings.language} onChange={(e) => setSettings((c) => ({ ...c, language: e.target.value }))}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option></select></label>
      <button className="action primary-action" disabled={busy}><Save /> Salvar aparência</button>
    </form>
  )
}

export function AccountUpdatesSection({ userId }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!userId) return
    getAccountAuditLog(userId).then(setItems).catch(() => setItems([]))
  }, [userId])

  return (
    <div className="account-update-list">
      <h2><ShieldCheck /> Histórico da conta</h2>
      {items.map((item) => (
        <div key={item.id}>
          <strong>{eventLabels[item.event_type] || item.event_type}</strong>
          <span>{formatDateTime(item.created_at)}</span>
          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <small>{Object.entries(item.metadata).map(([key,value]) => `${key}: ${value}`).join(' · ')}</small>
          )}
        </div>
      ))}
      {!items.length && <p className="community-empty">Ainda não há alterações registradas.</p>}
    </div>
  )
}
