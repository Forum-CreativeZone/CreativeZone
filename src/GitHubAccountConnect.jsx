import React, { useEffect, useState } from 'react'
import { CheckCircle2, Code2, Link2, RefreshCw, Unplug } from 'lucide-react'
import {
  captureGitHubProviderToken,
  connectGitHubIdentity,
  disconnectGitHubAccount,
  getCreativeZoneGitHubMembership,
  reauthorizeGitHubIdentity,
  getGitHubAccountStatus,
} from './services/githubAuthApi'

export function GitHubAccountConnect({ session, notify, compact = false, onChanged }) {
  const [state,setState]=useState(null)
  const [membership,setMembership]=useState(null)
  const [membershipError,setMembershipError]=useState('')
  const [loading,setLoading]=useState(Boolean(session?.user))
  const [busy,setBusy]=useState(false)

  async function load({ capture = false } = {}) {
    if(!session?.user){setState(null);setLoading(false);return}
    setLoading(true)
    try{
      const next = capture ? await captureGitHubProviderToken() : await getGitHubAccountStatus()
      setState(next)
      if(next?.connected){
        try{
          const nextMembership=await getCreativeZoneGitHubMembership()
          setMembership(nextMembership)
          setMembershipError(nextMembership?.authorized===false ? (nextMembership?.error || 'Autorize read:org para consultar a organização.') : '')
        }catch(error){
          setMembership(null)
          setMembershipError(error?.message || 'O GitHub não autorizou a leitura da organização.')
        }
      }else{
        setMembership(null)
        setMembershipError('')
      }
      onChanged?.(next)
    }catch(error){
      notify?.(error?.message || 'Não foi possível verificar sua conta GitHub.')
    }finally{setLoading(false)}
  }

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const returning=params.get('github_linked')==='1'
    load({capture:returning})
    if(returning){
      params.delete('github_linked')
      const query=params.toString()
      window.history.replaceState({},'',window.location.pathname+(query?'?'+query:''))
    }
  },[session?.user?.id])

  async function connect(){
    if(!session?.user) return
    setBusy(true)
    try{
      const returnTo=window.location.pathname || '/projetos'
      if(state?.identity_linked){
        await reauthorizeGitHubIdentity(returnTo)
      }else{
        await connectGitHubIdentity(returnTo)
      }
    }catch(error){
      notify?.(error?.message || 'Não foi possível conectar sua conta GitHub. Verifique se o vínculo manual de identidades está habilitado no Supabase Auth.')
      setBusy(false)
    }
  }

  async function authorizeOrganization(){
    if(!session?.user) return
    setBusy(true)
    try{
      const returnTo=window.location.pathname || '/projetos'
      await reauthorizeGitHubIdentity(returnTo)
    }catch(error){
      notify?.(error?.message || 'Não foi possível autorizar a leitura da organização GitHub.')
      setBusy(false)
    }
  }

  async function disconnect(){
    setBusy(true)
    try{
      await disconnectGitHubAccount()
      await load()
      notify?.('Integração GitHub desconectada do DevHub. Sua identidade de login não foi removida.')
    }catch(error){
      notify?.(error?.message || 'Não foi possível desconectar o GitHub.')
    }finally{setBusy(false)}
  }

  if(!session?.user) return null
  if(loading) return <section className={'github-account-connect '+(compact?'compact':'')}><RefreshCw className="security-spin"/><span>Verificando GitHub...</span></section>

  const connection=state?.connection
  const oauthPolicyRestricted=Boolean(
    membership?.authorized===false &&
    /OAuth App access restrictions/i.test(String(membership?.error||membershipError||''))
  )
  const needsOrgAuthorization=Boolean(state?.connected && (
    membershipError ||
    membership?.authorized===false ||
    state?.organization_access?.scope_authorized===false
  ))
  return (
    <section className={'github-account-connect '+(compact?'compact':'')}>
      <header>
        <span className="github-account-icon">{connection?.avatar_url?<img src={connection.avatar_url} alt=""/>:<Code2/>}</span>
        <span>
          <small>CONTA GITHUB DO MEMBRO</small>
          <strong>{state?.connected ? '@'+connection.github_username : 'Conecte seu GitHub'}</strong>
          <em>{state?.connected
            ? (membership?.member
                ? 'Membro da organização Creatiive-Zone'
                : oauthPolicyRestricted
                  ? 'O GitHub bloqueou este OAuth App na organização. Como proprietário, aprove o app na política OAuth da Creatiive-Zone.'
                  : needsOrgAuthorization
                    ? 'Autorize read:org para o DevHub enxergar membros privados da organização.'
                    : 'Conta reconhecida pelo CreativeZone DevHub')
            : 'Mesmo usando Google ou e-mail no fórum, seu perfil GitHub pode ser vinculado separadamente.'}</em>
        </span>
        {state?.connected?<CheckCircle2 className="github-account-ok"/>:<Link2/>}
      </header>
      <div className="github-account-actions">
        {!state?.connected
          ? <button className="action primary-action" disabled={busy} onClick={connect}><Code2/>{busy?'Abrindo GitHub...':'Conectar GitHub'}</button>
          : <>
              {oauthPolicyRestricted
                ? <a className="action primary-action" href="https://github.com/organizations/Creatiive-Zone/settings/oauth_application_policy" target="_blank" rel="noreferrer"><Link2/>Aprovar OAuth App na organização</a>
                : needsOrgAuthorization&&<button className="action primary-action" disabled={busy} onClick={authorizeOrganization}><Link2/>{busy?'Abrindo GitHub...':'Autorizar organização'}</button>}
              <button className="action" disabled={busy} onClick={()=>load({capture:true})}><RefreshCw/>Atualizar vínculo</button>
              {!compact&&<button className="action" disabled={busy} onClick={disconnect}><Unplug/>Desconectar DevHub</button>}
            </>}
      </div>
    </section>
  )
}
