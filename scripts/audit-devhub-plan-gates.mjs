import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'

const root=process.cwd()
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

const checks=[
  ['github-auth repository limits','supabase/functions/github-auth/index.ts',['repository_limit','private_repository','enforceRepositoryEntitlement']],
  ['github-api FREE/PRO data gates','supabase/functions/github-api/index.ts',['repository_recognition','scan_on_connect','commits_recent','issues','pull_requests','actions_status','languages_detailed','release_history']],
  ['security scan plan gates','supabase/functions/github-security-scan/index.ts',['osv_basic_check','osv_full','scheduled_rescan','push_scan','pull_request_scan','security_gate','private_repository']],
  ['ELITE workspace gates','supabase/functions/github-studio/index.ts',['project_studio','forum_commits','branch_pr_workflow','ci_cockpit','auto_fix']],
  ['ELITE teams server gate','supabase/functions/teams-api/index.ts',['private_teams','rank>=2','Criar equipes privadas é um benefício exclusivo do plano ELITE']],
]

let failed=false
for(const [label,file,needles] of checks){
  const source=read(file)
  const missing=needles.filter((needle)=>!source.includes(needle))
  if(missing.length){
    failed=true
    console.error('FAIL '+label+' — ausente: '+missing.join(', '))
  }else{
    console.log('PASS '+label)
  }
}

const migrations=fs.readdirSync(path.join(root,'supabase/migrations'))
  .filter((name)=>name.endsWith('.sql'))
  .map((name)=>read('supabase/migrations/'+name))
  .join('\n')

for(const key of ['private_teams','team_private_topics','team_role_management','team_public_preview_topics']){
  if(!migrations.includes(key)){
    failed=true
    console.error('FAIL entitlement '+key+' não está versionado em migration')
  }else console.log('PASS entitlement '+key)
}

if(failed) process.exit(1)
console.log('CreativeZone DevHub plan gates audit: OK')
