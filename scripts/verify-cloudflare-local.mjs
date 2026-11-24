import fs from 'node:fs';

const vars=Object.fromEntries(fs.readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const base=process.env.CF_LOCAL_URL??'http://127.0.0.1:8787';
const request=async(path,options={})=>fetch(`${base}${path}`,options);
const status=await request('/api/auth/status');
if(status.status!==200||(await status.json()).authenticated!==false) throw new Error('Unauthenticated session check failed.');
const login=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'marlene',password:vars.LOGIN_PASSWORD})});
if(login.status!==200) throw new Error('Cloudflare login failed.');
const cookie=login.headers.get('set-cookie')?.split(';')[0];
if(!cookie) throw new Error('Session cookie was not set.');
const get=async(path)=>{const res=await request(path,{headers:{Cookie:cookie}});if(!res.ok)throw new Error(`${path} returned ${res.status}: ${await res.text()}`);return res.json();};
const [products,employees,sales,dashboard,reports,settings]=await Promise.all([
 get('/api/products'),get('/api/employees'),get('/api/sales'),get('/api/dashboard'),get('/api/reports'),get('/api/settings'),
]);
if(products.length!==28||employees.length!==0||sales.length!==0) throw new Error('Production data cleanup did not preserve only the catalog.');
if(products.some(product=>Number(product.stock)!==0||String(product.image_url??'')!=='')) throw new Error('Product stock or legacy photo references remain.');
if(employees.some(employee=>'pin' in employee)) throw new Error('Private employee PIN leaked from the API.');
if(!dashboard||!reports||!settings) throw new Error('A required summary endpoint returned empty data.');
if(reports.payments.length||reports.stock_movements.length||reports.sales.length) throw new Error('Historical transactions remain after cleanup.');
const rejected=await request('/api/products');
if(rejected.status!==401) throw new Error('Protected data endpoint did not require authentication.');
console.log(JSON.stringify({ok:true,products:products.length,employees:employees.length,sales:sales.length,payments:reports.payments.length,stockMovements:reports.stock_movements.length,dashboard:true,reports:true,settings:true,auth:true},null,2));
