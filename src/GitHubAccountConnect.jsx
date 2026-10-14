import React, { useEffect, useState } from 'react'
import { CheckCircle2, Github, Link2, RefreshCw, Unplug } from 'lucide-react'
import {
  captureGitHubProviderToken,
  connectGitHubIdentity,
  disconnectGitHubAccount,
  getCreativeZoneGitHubMembership,
  getGitHubAccountStatus,
} from './services/githubAuthApi'

export function GitHubAccountConnect({ session, notify, compact = false, onChanged }) {
  const [state,setState]=useState(null)
  const [membership,setMembership]=useState(null)
  const [loading,setLoading]=useState(Boolean(session?.user))
  const [busy,setBusy]=useState(false)

  async function load({ capture = false } = {}) {
    if(!session?.user){setState(null);setLoading(false);return}
    setLoading(true)
    try{
      const next = capture ? await captureGitHubProviderToken() : await getGitHubAccountStatus()
      setState(next)
      if(next?.connected){
        try{setMembership(await getCreativeZoneGitHubMembership())}catch{setMembership(null)}
      }else setMembership(null)
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
      await connectGitHubIdentity(window.location.pathname || '/projetos')
    }catch(error){
      notify?.(error?.message || 'Não foi possível conectar sua conta GitHub. Verifique se o vínculo manual de identidades está habilitado no Supabase Auth.')
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
  return (
    <section className={'github-account-connect '+(compact?'compact':'')}>
      <header>
        <span className="github-account-icon">{connection?.avatar_url?<img src={connection.avatar_url} alt=""/>:<Github/>}</span>
        <span>
          <small>CONTA GITHUB DO MEMBRO</small>
          <strong>{state?.connected ? '@'+connection.github_username : 'Conecte seu GitHub'}</strong>
          <em>{state?.connected
            ? (membership?.member
                ? 'Membro da organização Creatiive-Zone'
                : 'Conta reconhecida pelo CreativeZone DevHub')
            : 'Mesmo usando Google ou e-mail no fórum, seu perfil GitHub pode ser vinculado separadamente.'}</em>
        </span>
        {state?.connected?<CheckCircle2 className="github-account-ok"/>:<Link2/>}
      </header>
      <div className="github-account-actions">
        {!state?.connected
          ? <button className="action primary-action" disabled={busy} onClick={connect}><Github/>{busy?'Abrindo GitHub...':'Conectar GitHub'}</button>
          : <>
              <button className="action" disabled={busy} onClick={()=>load({capture:true})}><RefreshCw/>Atualizar vínculo</button>
              {!compact&&<button className="action" disabled={busy} onClick={disconnect}><Unplug/>Desconectar DevHub</button>}
            </>}
      </div>
    </section>
  )
}
