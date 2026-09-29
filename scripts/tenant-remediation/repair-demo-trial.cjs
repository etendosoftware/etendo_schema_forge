#!/usr/bin/env node
// Tenant repair. Dates are explicit; dry run is the default.
const {spawnSync}=require('node:child_process');
const {writeFileSync,readFileSync}=require('node:fs');
const {Pool}=require('pg');
const args=process.argv.slice(2);
function option(key){const i=args.indexOf(key);return i<0?null:args[i+1];}
const apply=args.includes('--apply');
const auditOnly=args.includes('--audit-only');
const rollback=option('--rollback');
const start=option('--trial-start');
const auditPath=option('--audit');
const expectedAuditPath=option('--expected-audit');
function assert(ok,message){if(!ok)throw new Error(message);}
const attributes=['ETGO_TenantPlan','ETGO_EnvironmentType','ETGO_DemoTrialStartedAt','ETGO_LegacyTransitionStartedAt','ETGO_AssociatedProductiveClientId','ETGO_SubscriptionStatus','ETGO_SubscriptionDueAt','ETGO_SubscriptionEventAt','ETGO_AssociatedDemoClientId'];
const datePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
function validDate(value){
 if(!datePattern.test(value))return false;
 const parsed=Date.parse(value);
 // Date.parse normalizes impossible dates; verify UTC calendar/time components exactly.
 return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,19)===value.slice(0,19);
}
async function main(){
 for(let i=0;i<args.length;i++){assert(['--apply','--audit-only','--trial-start','--audit','--rollback','--expected-audit'].includes(args[i]),`Unknown argument ${args[i]}`);if(!['--apply','--audit-only'].includes(args[i])){assert(args[i+1]&&!args[i+1].startsWith('--'),`Missing ${args[i]} value`);i++;}}
 assert(!expectedAuditPath||(apply&&!rollback),'--expected-audit requires a repair apply');
 assert(!auditOnly||(!apply&&!rollback&&!start),'--audit-only cannot apply, roll back, or initialize dates');
 assert(auditOnly||rollback||validDate(start||''),'Provide --trial-start with an explicit UTC ISO instant');
 assert(!rollback||!start,'Rollback cannot initialize trial dates');
 assert(!apply||auditPath,'--apply requires --audit pointing to a NEW audit file');
 const {resolveDbDefaults}=await import('../../cli/src/db.js');
 const defaults=resolveDbDefaults(process.env.ETENDO_GRADLE_PROPERTIES||require('node:path').resolve(__dirname,'../../etendo_core/gradle.properties'));
 let password=process.env.ETENDO_DB_PASSWORD||defaults.password;
 if(process.env.ETGO_DATAFIX_AWS_PASSWORD==='1'){
 const secret=spawnSync('aws',['secretsmanager','get-secret-value','--region','eu-west-3','--profile','go','--secret-id',process.env.ETGO_DATAFIX_AWS_SECRET_ID||'etendo/production/bbdd-password','--query','SecretString','--output','text'],{encoding:'utf8'});
 assert(secret.status===0,'AWS production credential retrieval failed');password=secret.stdout.trim();
 }
 const expectedDatabase=process.env.ETENDO_DB_NAME||defaults.database;
 const pool=new Pool({host:'127.0.0.1',port:Number(process.env.ETENDO_DB_PORT||55432),user:process.env.ETENDO_DB_USER||defaults.user,database:expectedDatabase,password,connectionTimeoutMillis:5000});
 const db=await pool.connect();let begun=false;
 try{
 await db.query(apply?'BEGIN':'BEGIN READ ONLY');begun=true;
 await db.query("SET LOCAL lock_timeout = '5s'");await db.query("SET LOCAL statement_timeout = '60s'");
 assert((await db.query('select current_database() as name')).rows[0].name===expectedDatabase,'Unexpected database');
 if(apply)await db.query('LOCK TABLE ad_client,ad_user,ad_preference,etgo_checkout_request,etgo_tenant_pool IN SHARE ROW EXCLUSIVE MODE');
 const report={mode:apply?'apply':'dry-run',trialStart:start,generatedAt:new Date().toISOString(),database:expectedDatabase,entries:[]};
 if(rollback){
 const previous=JSON.parse(readFileSync(rollback,'utf8'));
 assert(previous.mode==='apply'&&previous.database===expectedDatabase&&Array.isArray(previous.entries),'Invalid original apply audit or wrong database');
 for(const e of previous.entries.filter(e=>e.inserted)){
 const rows=(await db.query('select * from ad_preference where ad_preference_id=$1 and ad_client_id=$2',[e.inserted.ad_preference_id,e.clientId])).rows;
 if(!rows.length){report.entries.push({clientId:e.clientId,status:'already_removed'});continue;}
 assert(JSON.stringify(rows[0])===JSON.stringify(e.inserted),`Preference ${e.inserted.ad_preference_id} changed; refusing rollback`);
 if(apply)await db.query('delete from ad_preference where ad_preference_id=$1 and ad_client_id=$2',[e.inserted.ad_preference_id,e.clientId]);
 report.entries.push({clientId:e.clientId,status:'rollback',before:rows[0]});
 }
 }else{
 const clients=(await db.query(`select c.ad_client_id,c.name,
 exists(select 1 from ad_user u where u.ad_client_id=c.ad_client_id and u.isactive='Y' and u.em_etgo_is_owner='Y') owned,
 exists(select 1 from etgo_tenant_pool t where t.pool_client_id=c.ad_client_id and t.isactive='Y' and upper(t.status)<>'CLAIMED') pool_reserved,
 exists(select 1 from etgo_tenant_pool t where t.pool_client_id=c.ad_client_id and t.isactive='Y' and coalesce(t.error_message,'') ilike '%fixture%') fixture,
 exists(select 1 from etgo_checkout_request q where (q.created_client_id=c.ad_client_id or lower(q.client_name)=lower(c.name) or exists(select 1 from ad_user u where u.ad_client_id=c.ad_client_id and u.isactive='Y' and u.em_etgo_is_owner='Y' and lower(u.email)=lower(q.account_email))) and (q.paid_at is not null or upper(q.checkout_status) in ('PAID','PROVISIONING','PROVISIONED') or q.stripe_subscription_id is not null)) paid
 from ad_client c where c.ad_client_id<>'0' and c.isactive='Y' order by c.ad_client_id`)).rows;
 for(const c of clients){
 const prefs=(await db.query('select * from ad_preference where ad_client_id=$1 and isactive=$2 and attribute=ANY($3::text[]) order by ad_preference_id',[c.ad_client_id,'Y',attributes])).rows;
 const entry={clientId:c.ad_client_id,name:c.name,before:prefs};report.entries.push(entry);
 const values=key=>prefs.filter(p=>p.attribute===key).map(p=>String(p.value||'').trim());
 const plan=values('ETGO_TenantPlan');const type=values('ETGO_EnvironmentType');
 if(c.paid||plan.some(v=>v.toUpperCase()==='PRODUCTIVE')||type.some(v=>v.toUpperCase()==='PRODUCTIVE')||['ETGO_SubscriptionStatus','ETGO_SubscriptionDueAt','ETGO_SubscriptionEventAt','ETGO_AssociatedDemoClientId'].some(a=>values(a).length)){entry.status='excluded_paid_or_productive';continue;}
 if(!c.owned||c.pool_reserved||c.fixture){entry.status='excluded_pool_or_unowned';continue;}
 if(values('ETGO_AssociatedProductiveClientId').some(Boolean)){entry.status='excluded_associated_productive';continue;}
 if(attributes.some(a=>values(a).length>1)||prefs.some(p=>p.ad_user_id||p.ad_window_id||p.visibleat_role_id||p.ispropertylist!=='N')){entry.status='conflicting_preferences';continue;}
 if(plan.some(v=>!['FREE'].includes(v.toUpperCase()))||type.some(v=>v.toUpperCase()!=='DEMO')){entry.status='unknown_classification';continue;}
 // Missing plan falls back to FREE in TenantPlanService; explicit demo also qualifies.
 const dates=[...values('ETGO_DemoTrialStartedAt'),...values('ETGO_LegacyTransitionStartedAt')];
 if(dates.length){entry.status=dates.every(validDate)?'preserved_existing_date':'malformed_date';continue;}
 entry.status='needs_legacy_transition';
 }
 const eligible=report.entries.filter(e=>e.status==='needs_legacy_transition');
 if(expectedAuditPath){
 const expected=JSON.parse(readFileSync(expectedAuditPath,'utf8'));
 assert(expected.database===expectedDatabase&&expected.mode==='dry-run'&&Array.isArray(expected.entries),'Expected audit must be a dry-run from this database');
 const expectedIds=expected.entries.filter(e=>e.status==='needs_legacy_transition').map(e=>e.clientId).sort();
 const actualIds=eligible.map(e=>e.clientId).sort();
 assert(new Set(expectedIds).size===expectedIds.length,'Expected audit contains duplicate candidate IDs');
 assert(JSON.stringify(expectedIds)===JSON.stringify(actualIds),'Candidate set differs from approved audit; refusing all writes');
 report.expectedAudit=expectedAuditPath;report.expectedClientIds=expectedIds;
 }
 if(apply)for(const entry of eligible){
 const inserted=await db.query(`insert into ad_preference(ad_preference_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,attribute,value,ispropertylist,selected)
 select get_uuid(),$1::varchar(32),'0','Y',now(),'0',now(),'0','ETGO_LegacyTransitionStartedAt',$2::text,'N','Y'
 where not exists(select 1 from ad_preference where ad_client_id=$1::varchar(32) and isactive='Y' and attribute in ('ETGO_DemoTrialStartedAt','ETGO_LegacyTransitionStartedAt')) returning *`,[entry.clientId,start]);
 assert(inserted.rowCount===1,'Concurrent lifecycle change detected');entry.inserted=inserted.rows[0];
 }
 }
 // Store the before image and exact inserted rows BEFORE committing; exclusive create avoids overwriting evidence.
 if(auditPath)writeFileSync(auditPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 await db.query(apply?'COMMIT':'ROLLBACK');begun=false;
 const counts={};for(const e of report.entries)counts[e.status]=(counts[e.status]||0)+1;
 console.log(JSON.stringify({mode:report.mode,counts,audit:auditPath,tenants:report.entries.map(e=>({clientId:e.clientId,name:e.name,status:e.status}))},null,2));
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
