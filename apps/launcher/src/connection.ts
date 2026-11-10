import { request } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
export type Connection={version:1;url:string;cert:string};
export function parseConnection(value:unknown):Connection{
 const c=z.object({version:z.literal(1),url:z.string().max(1000),cert:z.string().max(20000)}).strict().parse(value);const u=new URL(c.url);
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('올바른 HTTPS 서버 연결 파일이 아닙니다.');
 const cert=new X509Certificate(c.cert);if(Date.parse(cert.validTo)<=Date.now()||Date.parse(cert.validFrom)>Date.now())throw Error('서버 인증서가 만료됐거나 유효하지 않습니다.');
 const host=u.hostname.replace(/^\[|\]$/g,'');if(!(isIP(host)?cert.checkIP(host):cert.checkHost(host)))throw Error('서버 주소와 인증서가 일치하지 않습니다. 서버 PC에서 연결 파일을 다시 저장하세요.');
 return {...c,url:u.origin};
}
export function requestApi(c:Connection,path:string,body?:unknown,token?:string,key?:string):Promise<any>{return new Promise((resolve,reject)=>{
 const data=body===undefined?undefined:JSON.stringify(body);const req=request(new URL('/api'+path,c.url),{method:data?'POST':'GET',ca:c.cert,rejectUnauthorized:true,timeout:5000,headers:{...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(text.length>4_000_000){req.destroy(Error('서버 응답이 너무 큽니다.'));}});res.on('end',()=>{try{const value=JSON.parse(text);if((res.statusCode||500)>=400)reject(Error(value.error?.message||'서버 요청에 실패했습니다.'));else resolve(value);}catch{reject(Error('서버 응답 형식이 올바르지 않습니다.'));}});});req.on('timeout',()=>req.destroy(Error('서버 연결 시간이 초과됐습니다.')));req.on('error',reject);if(data)req.write(data);req.end();
 });}
