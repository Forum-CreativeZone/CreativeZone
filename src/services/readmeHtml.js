import {getGitHubReadmeAsset} from './githubApi'

export function sanitizeReadmeHtml(html=''){
  if(typeof window==='undefined'||!html) return ''
  try{
    const parser=new DOMParser()
    const doc=parser.parseFromString('<div id="cz-readme-root">'+html+'</div>','text/html')
    const root=doc.getElementById('cz-readme-root')
    if(!root) return ''
    root.querySelectorAll('script,style,iframe,object,embed,form,button,textarea,select,link,meta').forEach(node=>node.remove())
    root.querySelectorAll('input').forEach(input=>{
      const type=String(input.getAttribute('type')||'').toLowerCase()
      if(type!=='checkbox'||!input.hasAttribute('disabled')){ input.remove(); return }
      ;[...input.attributes].forEach(attr=>{
        if(!['type','checked','disabled'].includes(attr.name.toLowerCase())) input.removeAttribute(attr.name)
      })
      input.setAttribute('type','checkbox')
      input.setAttribute('disabled','')
    })
    root.querySelectorAll('*').forEach(node=>{
      ;[...node.attributes].forEach(attr=>{
        const name=attr.name.toLowerCase()
        const value=String(attr.value||'').trim()
        if(name.startsWith('on')) node.removeAttribute(attr.name)
        if(['href','src','xlink:href'].includes(name)&&/^(?:javascript|data:text\/html)/i.test(value)) node.removeAttribute(attr.name)
        if(name==='style') node.removeAttribute(attr.name)
      })
      if(node.tagName==='A'){
        const href=String(node.getAttribute('href')||'').trim()
        if(href.startsWith('#')){
          node.removeAttribute('target')
          node.removeAttribute('rel')
        }else{
          node.setAttribute('target','_blank')
          node.setAttribute('rel','noreferrer noopener')
        }
      }
      if(node.tagName==='IMG'){
        node.setAttribute('loading','lazy')
        node.setAttribute('decoding','async')
      }
    })
    return root.innerHTML
  }catch{return ''}
}

function normalizeRepoImage(src,owner,repo,branch,baseDir){
  const value=String(src||'').trim()
  if(!value) return null
  if(/^(?:data:|blob:)/i.test(value)) return {external:value}

  if(value.startsWith('/')){
    const raw=value.match(/^\/([^/]+)\/([^/]+)\/raw\/(?:refs\/heads\/)?([^/]+)\/(.+)$/)
    if(raw){
      const [,srcOwner,srcRepo,srcBranch,srcPath]=raw
      if(srcOwner.toLowerCase()===owner.toLowerCase()&&srcRepo.toLowerCase()===repo.toLowerCase()){
        return {path:decodeURIComponent(srcPath),branch:decodeURIComponent(srcBranch)}
      }
      return {external:'https://raw.githubusercontent.com/'+encodeURIComponent(srcOwner)+'/'+encodeURIComponent(srcRepo)+'/'+encodeURIComponent(srcBranch)+'/'+srcPath.split('/').map(encodeURIComponent).join('/')}
    }
  }

  try{
    const absolute=new URL(value,'https://creativezone.invalid/'+baseDir)

    if(absolute.hostname==='creativezone.invalid'){
      return {path:decodeURIComponent(absolute.pathname.replace(/^\//,''))}
    }

    if(/(^|\.)github\.com$/i.test(absolute.hostname)){
      const match=absolute.pathname.match(/^\/([^/]+)\/([^/]+)\/raw\/(?:refs\/heads\/)?([^/]+)\/(.+)$/)
      if(match){
        const [,srcOwner,srcRepo,srcBranch,srcPath]=match
        if(srcOwner.toLowerCase()===owner.toLowerCase()&&srcRepo.toLowerCase()===repo.toLowerCase()){
          return {path:decodeURIComponent(srcPath),branch:decodeURIComponent(srcBranch)}
        }
      }
      return {external:absolute.toString()}
    }

    if(absolute.hostname==='raw.githubusercontent.com'){
      const parts=absolute.pathname.split('/').filter(Boolean)
      if(parts.length>=4){
        const [srcOwner,srcRepo,srcBranch,...rest]=parts
        if(srcOwner.toLowerCase()===owner.toLowerCase()&&srcRepo.toLowerCase()===repo.toLowerCase()){
          return {path:decodeURIComponent(rest.join('/')),branch:decodeURIComponent(srcBranch)}
        }
      }
      return {external:absolute.toString()}
    }

    if(/^https?:$/i.test(absolute.protocol)) return {external:absolute.toString()}
  }catch{}

  return {path:value.replace(/^\.\//,'').replace(/^\//,'')}
}

export async function prepareReadmeHtml(readmeDoc,projectId){
  if(typeof window==='undefined'||!readmeDoc?.html) return ''
  try{
    const parser=new DOMParser()
    const doc=parser.parseFromString('<div id="cz-readme-hydrate">'+readmeDoc.html+'</div>','text/html')
    const root=doc.getElementById('cz-readme-hydrate')
    if(!root) return sanitizeReadmeHtml(readmeDoc.html)

    const owner=String(readmeDoc.owner||'')
    const repo=String(readmeDoc.repo||'')
    const branch=String(readmeDoc.branch||'main')
    const readmePath=String(readmeDoc.path||'README.md')
    const baseDir=readmePath.includes('/')?readmePath.slice(0,readmePath.lastIndexOf('/')+1):''

    const images=[...root.querySelectorAll('img')].slice(0,30)
    await Promise.all(images.map(async img=>{
      const src=String(img.getAttribute('src')||'').trim()
      if(!src) return
      const parsed=normalizeRepoImage(src,owner,repo,branch,baseDir)
      if(!parsed) return
      if(parsed.external){
        img.setAttribute('src',parsed.external)
        return
      }
      if(!parsed.path) return
      try{
        const asset=await getGitHubReadmeAsset(projectId,parsed.path)
        if(asset?.data_url) img.setAttribute('src',asset.data_url)
      }catch{
        if(owner&&repo){
          img.setAttribute('src','https://raw.githubusercontent.com/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/'+encodeURIComponent(parsed.branch||branch)+'/'+parsed.path.split('/').map(encodeURIComponent).join('/'))
        }
      }
    }))

    root.querySelectorAll('a[href]').forEach(link=>{
      const href=String(link.getAttribute('href')||'').trim()
      if(!href||href.startsWith('#')||/^(?:https?:|mailto:)/i.test(href)) return
      try{
        const url=new URL(href,'https://creativezone.invalid/'+baseDir)
        const path=decodeURIComponent(url.pathname.replace(/^\//,''))
        if(path&&owner&&repo){
          link.setAttribute('href','https://github.com/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/blob/'+encodeURIComponent(branch)+'/'+path.split('/').map(encodeURIComponent).join('/'))
        }
      }catch{}
    })

    return sanitizeReadmeHtml(root.innerHTML)
  }catch{
    return sanitizeReadmeHtml(readmeDoc?.html||'')
  }
}
