import { readFileSync,mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces,hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { generate } from 'selfsigned';
import { openDatabase } from './domain';
import { buildApp } from './app';
export function validateBinding(host:string,tls?:{cert:string;key:string}){if(!['127.0.0.1','localhost','::1'].includes(host)&&!tls)throw Error('LAN 서버는 TLS 인증서가 필요합니다.');}
export function localAddresses(){return Object.values(networkInterfaces()).flatMap(v=>v||[]).filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address);}
export async function prepareServer(dataDir:string){
 mkdirSync(dataDir,{recursive:true});const certFile=join(dataDir,'server.crt'),keyFile=join(dataDir,'server.key');
 if(!existsSync(certFile)||!existsSync(keyFile)){
  const pems=generate([{name:'commonName',value:'Festival PC Club'}],{keySize:2048,days:365,algorithm:'sha256',extensions:[{name:'basicConstraints',cA:true},{name:'keyUsage',digitalSignature:true,keyEncipherment:true,keyCertSign:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:2,value:hostname()},{type:7,ip:'127.0.0.1'},...localAddresses().map(ip=>({type:7,ip}))]}]});
  writeFileSync(certFile,pems.cert,{mode:0o600});writeFileSync(keyFile,pems.private,{mode:0o600});
 }
 const setupFile=join(dataDir,'setup-token');if(!existsSync(setupFile))writeFileSync(setupFile,randomBytes(24).toString('hex'),{mode:0o600});
 return {tls:{cert:readFileSync(certFile,'utf8'),key:readFileSync(keyFile,'utf8')},setupToken:readFileSync(setupFile,'utf8'),certFile};
}
export async function startServer(opts:{dataDir:string;webRoot:string;host?:string;port?:number;development?:boolean}){
 const prepared=await prepareServer(opts.dataDir);const host=opts.host||'0.0.0.0';const tls=opts.development?undefined:prepared.tls;validateBinding(host,tls);
 const db=openDatabase(join(opts.dataDir,'festival.sqlite'));const app=await buildApp({db,setupToken:prepared.setupToken,tls,webRoot:opts.webRoot});
 try{await app.listen({host,port:opts.port??8443});}catch(e){db.close();throw e;}
 return {...prepared,app,db,url:`${tls?'https':'http'}://localhost:${(app.server.address() as any).port}`,addresses:localAddresses()};
}
