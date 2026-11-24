import crypto from 'node:crypto';
import fs from 'node:fs';

const vars=Object.fromEntries(fs.readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const base=process.env.CF_LOCAL_URL??'http://127.0.0.1:8787';
const request=async(path,options={})=>fetch(`${base}${path}`,options);
const login=async(password)=>{
 const response=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'marlene',password})});
 if(!response.ok)throw new Error(`Login failed (${response.status}): ${await response.text()}`);
 return response.headers.get('set-cookie')?.split(';')[0];
};
const change=async(cookie,current,next)=>{
 const response=await request('/api/auth/password',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({current_password:current,new_password:next,confirm_password:next})});
 if(!response.ok)throw new Error(`Password change failed (${response.status}): ${await response.text()}`);
 return response.headers.get('set-cookie')?.split(';')[0];
};
const initial=vars.LOGIN_PASSWORD,temp=crypto.randomBytes(24).toString('base64url');
let cookie=await login(initial);
try{
 cookie=await change(cookie,initial,temp);
 await login(temp);
 cookie=await change(cookie,temp,initial);
 await login(initial);
 console.log(JSON.stringify({ok:true,changeAndRestore:true}));
}catch(error){
 try{const recovery=await login(temp);await change(recovery,temp,initial);}catch{}
 throw error;
}
