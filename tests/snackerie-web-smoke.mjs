// Test the exported web app with fictional accounts. All external requests are mocked or blocked.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const date='2026-10-05';
const parent={id:id(1),user_id:id(101),first_name:'Parent',last_name:'Test',school_id:id(10),is_admin:true};
const provider={id:id(2),user_id:id(101),company_name:'Cuisine test',pin:null};
const school={id:id(10),user_id:id(101),name:'École test',closed_weekdays:[0],is_school_user:true};
const children=[{id:id(20),parent_id:id(1),school_id:id(10),first_name:'Alice',last_name:'Mixte',grade:'CE2',allergies:['Gluten'],dietary_restrictions:[]},{id:id(21),parent_id:id(1),school_id:id(10),first_name:'Basile',last_name:'Classique',grade:'CE2',allergies:[],dietary_restrictions:[]}];
const menus=[{id:id(40),library_menu_id:id(30),meal_name:'Poulet rôti',meal_category:'classic',price:40},{id:id(41),library_menu_id:id(31),meal_name:'Tacos poulet',meal_category:'snack',price:30}].map(m=>({...m,provider_id:id(2),school_id:id(10),date,description:'Repas de test',available:true,allergens:[],supplements:[],card_color:'#FFE4E1',created_at:'2026-10-03T10:00:00Z'}));
const reservations=menus.map((m,i)=>({id:id(70+i),child_id:id(20),parent_id:id(1),menu_id:m.id,date,payment_status:'paid',total_price:m.price,annotations:i?'Sans sauce':'',supplements:[],created_at:'2026-10-03T10:00:00Z',child:children[0],children:children[0],menu:{...m,school,provider},menus:m}));
const snapshot={generated_at:'2026-10-05T06:00:00Z',orders:menus.map((m,i)=>({id:id(70+i),child_id:id(20),child_name:'Alice Mixte',parent_name:'Parent Test',school_id:id(10),school_name:'École test',grade:'CE2',genre:'fille',allergies:['Gluten'],dietary_restrictions:[],supplements:[],annotations:i?'Sans sauce':'',meal_name:m.meal_name,meal_category:m.meal_category}))};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const user={id:id(101),aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
await context.addInitScript(({user})=>localStorage.setItem('sb-wreusophfpedauznrjfl-auth-token',JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',expires_at:4102444800,token_type:'bearer',user})),{user});
let writes=[];let unknown=[];
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin === new URL(process.env.UI_BASE_URL || 'http://127.0.0.1:4178').origin)return route.continue();
 if(url.hostname!=='wreusophfpedauznrjfl.supabase.co')return route.abort();
 const table=url.pathname.split('/').at(-1);let data=[];
 if(req.method()!=='GET'){writes.push({method:req.method(),table,body:req.postDataJSON()});}
 if(url.pathname.includes('/auth/'))data=user;
 else if(table==='providers')data=[provider];
 else if(table==='parents')data=[parent];
 else if(table==='schools')data=[school];
 else if(table==='children')data=children;
 else if(table==='provider_school_access')data=[{school_id:school.id,schools:school}];
 else if(table==='provider_menu_library')data=menus.map(m=>({...m,id:m.library_menu_id}));
 else if(table==='menus')data=menus;
 else if(table==='reservations')data=reservations;
 else if(table==='get_provider_school_students')data=children.map(c=>({...c,parent_first_name:'Parent',parent_last_name:'Test'}));
 else if(table==='get_provider_student_meal_counts')data=[{child_id:id(20),classic_count:1,snack_count:1},{child_id:id(21),classic_count:1,snack_count:0}];
 else if(table==='get_preparation_snapshot')data=snapshot;
 else if(!['cart_items','provider_supplements','parent_credits','credit_transactions','provider_week_plans'].includes(table))unknown.push(table);
 if(Array.isArray(data)&&url.searchParams.get('id')?.startsWith('eq.'))data=data.filter(x=>x.id===url.searchParams.get('id').slice(3));
 if(req.headers().accept?.includes('vnd.pgrst.object'))data=Array.isArray(data)?data[0]??null:data;
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-10-05T06:00:00Z')});
const root=process.env.UI_BASE_URL || 'http://127.0.0.1:4178';
const out=process.env.UI_SCREENSHOT_DIR || await mkdtemp(join(tmpdir(), 'snackerie-ui-'));await mkdir(out,{recursive:true});
async function open(path){await page.goto(root+path);await page.getByRole('tab',{name:'Snackerie',exact:true}).waitFor({timeout:20000});}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});}
try {
 await open('/(provider)/library');
 await page.getByText('Poulet rôti',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Snackerie',exact:true}).click();
 await page.getByText('Tacos poulet',{exact:true}).waitFor();assert.equal(await page.getByText('Poulet rôti',{exact:true}).count(),0);await shot('provider-library');console.log('PASS provider library filters');
 await open('/(provider)/students');
 await page.getByText('Basile Classique',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Snackerie',exact:true}).click();
 await page.getByText('Alice Mixte',{exact:true}).waitFor();assert.equal(await page.getByText('Basile Classique',{exact:true}).count(),0);await shot('provider-students');
 await page.getByRole('tab',{name:'Menus classiques',exact:true}).click();await page.getByText('Basile Classique',{exact:true}).waitFor();console.log('PASS mixed child in both categories');
 await open('/(parent)/reservation?childId='+id(20)+'&date='+date);
 await page.getByText('Poulet rôti',{exact:true}).waitFor();await page.getByRole('tab',{name:'Snackerie',exact:true}).click();await page.getByText('Tacos poulet',{exact:true}).waitFor();assert.equal(await page.getByText('Poulet rôti',{exact:true}).count(),0);await shot('parent-reservation');console.log('PASS parent selection');
 await open('/(provider)/menu-orders?menuIds='+encodeURIComponent(JSON.stringify(menus.map(m=>m.id)))+'&menuName=Repas&date='+date);
 await page.getByRole('tab',{name:'Snackerie',exact:true}).click();await page.getByText('Alice Mixte',{exact:true}).waitFor();assert.equal(await page.getByText('Menu classique',{exact:true}).count(),0);await shot('provider-orders');console.log('PASS provider order list');
 await page.getByText('Exporter',{exact:true}).click();await page.getByText('CSV',{exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByText('Exporter en CSV',{exact:true}).click();const download=await downloadPromise;const csv=await readFile(await download.path(),'utf8');assert.match(csv,/Snackerie/);assert.match(csv,/Tacos poulet/);assert.match(csv,/Gluten/);assert.match(csv,/Sans sauce/);assert.doesNotMatch(csv,/Poulet rôti/);console.log('PASS snack CSV export retains allergies and instructions');
 await open('/(provider)/add-menu?category=snack');
 assert.equal(await page.getByRole('tab',{name:'Snackerie',exact:true}).getAttribute('aria-selected'),'true');await shot('provider-add-snack');
 await page.getByPlaceholder('Ex: Poulet rôti & légumes').fill('Wrap poulet test');await page.getByPlaceholder('0.00').first().fill('35');await page.getByText('Enregistrer',{exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('succès')||document.body.innerText.includes('ajouté'));assert.equal(writes.find(w=>w.table==='provider_menu_library'&&w.method==='POST')?.body.meal_category,'snack');console.log('PASS snack creation selection');
 await open('/(admin)/orders');await page.getByRole('tab',{name:'Snackerie',exact:true}).click();await page.getByText('Tacos poulet',{exact:true}).waitFor();assert.equal(await page.getByText('Poulet rôti',{exact:true}).count(),0);await shot('admin-orders');console.log('PASS admin category filter');
 assert.deepEqual(errors,[]);console.log('Browser runtime errors: 0; blocked/mocked all external requests. Unknown mock routes:',[...new Set(unknown)]);
} catch(e){console.error('FAILED',e);console.error((await page.locator('body').innerText()).slice(0,5000));await shot('failure');process.exitCode=1;}finally{await browser.close();}
