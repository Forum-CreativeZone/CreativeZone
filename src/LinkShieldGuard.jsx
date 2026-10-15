import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import {
  checkLinkSafety,
  getCachedLinkSafety,
  normalizeShieldUrl,
  reportSuspiciousLink,
  shouldBypassLinkShield,
} from './services/linkShieldApi'

function messageFor(safety) {
  if (safety?.verdict === 'malicious') return 'Esta URL foi associada à distribuição de malware por uma fonte de reputação configurada.'
  if (safety?.verdict === 'local_network') return 'Este link aponta para uma rede local ou endereço reservado.'
  if (safety?.verdict === 'sensitive_url') return 'A URL contém token, assinatura ou credencial e não foi enviada a provedores externos.'
  return 'A reputação deste endereço não pôde ser confirmada.'
}

export function LinkShieldNotice({ url, safety, compact = false, className = '' }) {
  const decision=safety?.decision || 'warn'
  const domain=useMemo(()=>{
    try{return new URL(url).hostname.replace(/^www\./,'')}catch{return 'link externo'}
  },[url])

  return (
    <div className={['cz-link-shield-notice','is-'+decision,compact?'is-compact':'',className].filter(Boolean).join(' ')}>
      <span className="cz-link-shield-notice-icon">{decision==='block'?<ShieldAlert/>:<AlertTriangle/>}</span>
      <span className="cz-link-shield-notice-body">
        <small>CREATIVEZONE LINK SHIELD</small>
        <strong>{decision==='block'?'Link potencialmente perigoso':'Verificação de segurança necessária'}</strong>
        <span>{messageFor(safety)}</span>
        <em>{domain}</em>
      </span>
    </div>
  )
}

export function LinkShieldGate({ url, children, context='embed', compact=false, className='' }) {
  const normalized=useMemo(()=>normalizeShieldUrl(url),[url])
  const [safety,setSafety]=useState(()=>getCachedLinkSafety(normalized))
  const [loading,setLoading]=useState(!safety)

  useEffect(()=>{
    let active=true
    if(!normalized || shouldBypassLinkShield(normalized)){
      setLoading(false)
      return undefined
    }
    const cached=getCachedLinkSafety(normalized)
    if(cached){
      setSafety(cached)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    checkLinkSafety(normalized,{context}).then((next)=>{
      if(active) setSafety(next)
    }).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[normalized,context])

  if(!normalized) return null
  if(loading){
    return <div className={['cz-link-shield-loading',compact?'is-compact':'',className].filter(Boolean).join(' ')}>
      <ShieldCheck/><span>Verificando segurança do link…</span>
    </div>
  }
  if(safety && (safety.decision==='warn'||safety.decision==='block')){
    return <LinkShieldNotice url={normalized} safety={safety} compact={compact} className={className}/>
  }
  return children
}

export function LinkShieldGuard() {
  const [warning,setWarning]=useState(null)
  const [reportState,setReportState]=useState('')

  useEffect(()=>{
    const handler=(event)=>{
      if(event.defaultPrevented || event.button!==0) return
      const anchor=event.target?.closest?.('a[href]')
      if(!anchor || anchor.dataset?.linkShieldSkip==='true') return

      const normalized=normalizeShieldUrl(anchor.href)
      if(!normalized || shouldBypassLinkShield(normalized)) return

      const cached=getCachedLinkSafety(normalized)
      if(cached?.decision==='allow') return

      event.preventDefault()
      event.stopPropagation()
      const target=anchor.getAttribute('target')||''

      if(cached && (cached.decision==='warn'||cached.decision==='block')){
        setWarning({url:normalized,safety:cached,target})
        return
      }

      const pendingWindow=target==='_blank' ? window.open('','_blank') : null
      if(pendingWindow) pendingWindow.opener=null

      const navigate=()=>{
        if(target==='_blank'){
          if(pendingWindow) pendingWindow.location.href=normalized
          else window.location.assign(normalized)
        }else{
          window.location.assign(normalized)
        }
      }

      checkLinkSafety(normalized,{context:'outbound_click'}).then((safety)=>{
        if(!safety || safety.decision==='allow'){
          navigate()
          return
        }
        pendingWindow?.close()
        setWarning({url:normalized,safety,target})
      }).catch(navigate)
    }

    document.addEventListener('click',handler,true)
    return()=>document.removeEventListener('click',handler,true)
  },[])

  if(!warning) return null
  const blocked=warning.safety?.decision==='block'

  const continueAnyway=()=>{
    const {url,target}=warning
    setWarning(null)
    setReportState('')
    if(target==='_blank'){
      const opened=window.open(url,'_blank','noopener,noreferrer')
      if(!opened) window.location.assign(url)
    }else{
      window.location.assign(url)
    }
  }

  const report=async()=>{
    setReportState('Enviando…')
    try{
      await reportSuspiciousLink(warning.url)
      setReportState('Denúncia enviada.')
    }catch{
      setReportState('Entre na sua conta para denunciar este link.')
    }
  }

  return (
    <div className="cz-link-shield-backdrop" role="presentation" onMouseDown={()=>setWarning(null)}>
      <section className={'cz-link-shield-dialog '+(blocked?'is-blocked':'is-warning')} role="alertdialog" aria-modal="true" aria-labelledby="cz-link-shield-title" onMouseDown={(event)=>event.stopPropagation()}>
        <header>
          <span>{blocked?<ShieldAlert/>:<AlertTriangle/>}</span>
          <div>
            <small>CREATIVEZONE LINK SHIELD</small>
            <h2 id="cz-link-shield-title">{blocked?'Link potencialmente perigoso':'Atenção antes de continuar'}</h2>
          </div>
          <button type="button" className="cz-link-shield-close" onClick={()=>setWarning(null)} aria-label="Fechar"><X/></button>
        </header>
        <p>{messageFor(warning.safety)}</p>
        <div className="cz-link-shield-url">{warning.url}</div>
        <div className="cz-link-shield-risk">
          <span>Risco estimado <strong>{Number(warning.safety?.risk_score||0)}/100</strong></span>
          <span>Decisão <strong>{blocked?'BLOQUEADO':'AVISO'}</strong></span>
        </div>
        {warning.safety?.providers?.urlhaus?.status==='match'&&<p className="cz-link-shield-source">Fonte: URLhaus / abuse.ch</p>}
        {reportState&&<p className="cz-link-shield-report-state">{reportState}</p>}
        <footer>
          <button type="button" className="action primary-action" onClick={()=>setWarning(null)}>Voltar em segurança</button>
          <button type="button" className="action" onClick={report}>Denunciar link</button>
          <button type="button" className="action danger" onClick={continueAnyway}>Abrir mesmo assim <ExternalLink/></button>
        </footer>
      </section>
    </div>
  )
}
