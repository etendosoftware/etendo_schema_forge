const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const root=resolve(__dirname,'../../..');
const env={...process.env,ETENDO_DB_HOST:'127.0.0.1',ETENDO_DB_PORT:'55432',ETENDO_DB_NAME:'etendo_local',ETENDO_DB_USER:'tad',ETENDO_DB_PASSWORD:'tad',ETGO_DATAFIX_AWS_PASSWORD:'0'};
const uuid=()=>randomUUID().replaceAll('-','').toUpperCase();
test('real local datafix repairs a broken demo, preserves excluded tenants, and is idempotent',async()=>{
 const db=new Client({host:env.ETENDO_DB_HOST,port:55432,user:'tad',password:'tad',database:'etendo_local'});
 const ids=[];const dir=mkdtempSync(join(tmpdir(),'demo-datafix-test-'));const start=new Date().toISOString();
 const run=(script,args,extra={})=>{const r=spawnSync(process.execPath,[script,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout;};
 const prefs=async id=>(await db.query('select * from ad_preference where (ad_client_id=$1 or visibleat_client_id=$1) order by ad_preference_id',[id])).rows;
 await db.connect();
 try{
  assert.equal((await db.query('select current_database() db')).rows[0].db,'etendo_local');
  const baseline=(await db.query('select * from ad_preference order by ad_preference_id')).rows;
  async function fixture(label,owner=true){const id=uuid();ids.push(id);const name=`DFTEST_${id}`;await db.query(`insert into ad_client(ad_client_id,ad_org_id,createdby,updatedby,value,name,description) values($1,'0','0','0',$2,$2,$3)`,[id,name,label]);if(owner)await db.query(`insert into ad_user(ad_user_id,ad_client_id,ad_org_id,createdby,updatedby,name,email,username,em_etgo_is_owner) values($1,$2,'0','0','0',$3,$4,$4,'Y')`,[uuid(),id,name,name+'@example.invalid']);return id;}
  async function preference(id,key,value){await db.query(`insert into ad_preference(ad_preference_id,ad_client_id,ad_org_id,createdby,updatedby,attribute,value,ispropertylist,selected,visibleat_client_id) values($1,$2,'0','0','0',$3,$4,'N','Y',$5)`,[uuid(),id,key,value,key==='ETGO_TenantPlan'?id:null]);}
  const broken=await fixture('broken demo');await preference(broken,'ETGO_TenantPlan','FREE');await preference(broken,'ETGO_EnvironmentType','DEMO');
  const productive=await fixture('productive exclusion');await preference(productive,'ETGO_TenantPlan','PRODUCTIVE');
  const dated=await fixture('existing date exclusion');await preference(dated,'ETGO_TenantPlan','FREE');await preference(dated,'ETGO_DemoTrialStartedAt',start);
  const pooled=await fixture('pool exclusion');await preference(pooled,'ETGO_TenantPlan','FREE');await db.query(`insert into etgo_tenant_pool(etgo_tenant_pool_id,ad_client_id,ad_org_id,createdby,updatedby,pool_client_id,status,provisioning_version) values($1,'0','0','0','0',$2,'READY','DATAFIX_TEST')`,[uuid(),pooled]);
  const unowned=await fixture('unowned exclusion',false);
  const subscribed=await fixture('subscription exclusion');await preference(subscribed,'ETGO_TenantPlan','FREE');await preference(subscribed,'ETGO_SubscriptionStatus','ACTIVE');
  const malformed=await fixture('malformed date exclusion');await preference(malformed,'ETGO_TenantPlan','FREE');await preference(malformed,'ETGO_DemoTrialStartedAt','not-a-date');
  const markers=[];for(const attribute of ['ETGO_SubscriptionDueAt','ETGO_SubscriptionEventAt','ETGO_AssociatedDemoClientId']){const id=await fixture(attribute+' exclusion');await preference(id,'ETGO_TenantPlan','FREE');await preference(id,attribute,attribute==='ETGO_AssociatedDemoClientId'?'':start);markers.push(id);}
  const visibleProductive=await fixture('system visible productive exclusion');await db.query("insert into ad_preference(ad_preference_id,ad_client_id,ad_org_id,createdby,updatedby,attribute,value,ispropertylist,selected,visibleat_client_id) values($1,'0','0','0','0','ETGO_TenantPlan','productive','N','Y',$2)",[uuid(),visibleProductive]);
  const excluded=[productive,dated,pooled,unowned,subscribed,malformed,...markers,visibleProductive];const excludedPrefs=async()=>{const rows=[];for(const id of excluded)rows.push(await prefs(id));return rows;};const before=await excludedPrefs();
  const script='scripts/tenant-remediation/repair-demo-trial.cjs';
  const impossible=spawnSync(process.execPath,[script,'--trial-start','2026-02-30T12:00:00Z','--apply','--audit',join(dir,'invalid.json')],{cwd:root,env,encoding:'utf8',timeout:90000});assert.notEqual(impossible.status,0);assert.match(impossible.stderr,/explicit UTC ISO instant/);assert.equal((await prefs(broken)).length,2);assert.deepEqual(await excludedPrefs(),before);
  console.log('Standalone impossible calendar date refused without preference changes');
  const reviewed=join(dir,'reviewed.json');const dry=JSON.parse(run(script,['--trial-start',start,'--audit',reviewed]));assert.equal(dry.tenants.find(t=>t.clientId===broken).status,'needs_legacy_transition');assert.equal((await prefs(broken)).length,2);
  const mismatched=JSON.parse(readFileSync(reviewed,'utf8'));mismatched.entries.find(e=>e.clientId===broken).clientId=uuid();const mismatchPath=join(dir,'mismatch.json');writeFileSync(mismatchPath,JSON.stringify(mismatched));
  const unchangedBefore=(await db.query('select * from ad_preference order by ad_preference_id')).rows;
  const rejected=spawnSync(process.execPath,[script,'--trial-start',start,'--apply','--audit',join(dir,'rejected.json'),'--expected-audit',mismatchPath],{cwd:root,env,encoding:'utf8',timeout:90000});assert.notEqual(rejected.status,0);assert.doesNotMatch(rejected.stderr,/Unknown argument/);assert.deepEqual((await db.query('select * from ad_preference order by ad_preference_id')).rows,unchangedBefore);assert.equal(existsSync(join(dir,'rejected.json')),false);
  console.log('Expected-audit same-count different client IDs rejected with zero writes');
  const audit=join(dir,'apply.json');run(script,['--trial-start',start,'--apply','--audit',audit,'--expected-audit',reviewed]);
  let repaired=await prefs(broken);assert.equal(repaired.length,3);assert.equal(repaired.find(p=>p.attribute==='ETGO_LegacyTransitionStartedAt').value,start);
  run(script,['--trial-start',start,'--apply','--audit',join(dir,'second.json')]);assert.deepEqual(await prefs(broken),repaired);assert.deepEqual(await excludedPrefs(),before);
  run(script,['--rollback',audit,'--apply','--audit',join(dir,'rollback.json')]);assert.equal((await prefs(broken)).length,2);
  const canonical='20260929T180000Z__R41-demo-legacy-trial-start';
  if(existsSync(join(root,'cli/src/data-fixes/sql',canonical+'.sql'))){
   const args=['--fix',canonical,'--client',broken];const options={PGOPTIONS:`-c etendo_go.demo_transition_started_at=${start}`};
   run('cli/src/data-fixes/run.js',[...args,'--dry-run'],options);assert.equal((await prefs(broken)).length,2);
   const missingDate=spawnSync(process.execPath,['cli/src/data-fixes/run.js',...args],{cwd:root,env:{...env,PGOPTIONS:''},encoding:'utf8',timeout:90000});assert.notEqual(missingDate.status,0);assert.equal((await prefs(broken)).length,2);
   console.log('Canonical missing-date apply refused atomically');
   const invalidDate=spawnSync(process.execPath,['cli/src/data-fixes/run.js',...args],{cwd:root,env:{...env,PGOPTIONS:'-c etendo_go.demo_transition_started_at=2026-02-30T12:00:00Z'},encoding:'utf8',timeout:90000});assert.notEqual(invalidDate.status,0);assert.equal((await prefs(broken)).length,2);console.log('Canonical impossible calendar date refused atomically');
   run('cli/src/data-fixes/run.js',args,options);repaired=await prefs(broken);assert.equal(repaired.length,3);assert.equal(repaired.find(p=>p.attribute==='ETGO_LegacyTransitionStartedAt').value,start);
   run('cli/src/data-fixes/run.js',args,options);assert.deepEqual(await prefs(broken),repaired);
   for(const id of excluded)run('cli/src/data-fixes/run.js',['--fix',canonical,'--client',id],options);
   assert.deepEqual(await excludedPrefs(),before);
   console.log('Canonical runner: dry run, apply, repeat and exclusions passed');
  }else console.log('Canonical SQL not available; standalone verified');
  console.log('Standalone: dry run 0 writes; first apply 1 preference; second apply 0; rollback removed 1; 10 exclusions unchanged');
  await cleanup();assert.deepEqual((await db.query('select * from ad_preference order by ad_preference_id')).rows,baseline);
  console.log('Cleanup verified: original AD_Preference state restored');
 }finally{try{await cleanup();}finally{await db.end();rmSync(dir,{recursive:true,force:true});}}
 async function cleanup(){if(!ids.length)return;await db.query('delete from etgo_data_fix_history where remediated_client_id=ANY($1::text[])',[ids]);await db.query('delete from etgo_tenant_pool where pool_client_id=ANY($1::text[])',[ids]);await db.query('delete from ad_preference where ad_client_id=ANY($1::text[]) or visibleat_client_id=ANY($1::text[])',[ids]);await db.query('delete from ad_user where ad_client_id=ANY($1::text[])',[ids]);await db.query('delete from ad_sequence where ad_client_id=ANY($1::text[])',[ids]);await db.query('delete from ad_client where ad_client_id=ANY($1::text[])',[ids]);}
});
