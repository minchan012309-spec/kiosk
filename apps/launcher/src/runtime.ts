export class SessionClock{
 private deadline=0;
 constructor(private monotonic=()=>performance.now()){}
 sync(serverNow:number,endAt:number){this.deadline=this.monotonic()+Math.max(0,endAt-serverNow);}
 remaining(){return Math.max(0,this.deadline-this.monotonic());}
}
export class ExitGate{
 private consumed=new Set<string>();
 constructor(private deviceId:string,private now=Date.now){}
 consume(c:{id:string;deviceId:string;expiresAt:number}){if(c.deviceId!==this.deviceId||c.expiresAt<=this.now()||this.consumed.has(c.id))return false;this.consumed.add(c.id);return true;}
}
export class GameController{
 private pid:number|undefined;private operation=Promise.resolve();
 constructor(private spawn:(path:string,args:string[])=>Promise<number>,private terminate:(pid:number)=>Promise<void>){}
 start(game:{executable:string;args:string[]}){return this.enqueue(async()=>{await this.stopOwned();this.pid=await this.spawn(game.executable,game.args);});}
 stop(){return this.enqueue(()=>this.stopOwned());}
 private async stopOwned(){if(this.pid!==undefined){await this.terminate(this.pid);this.pid=undefined;}}
 private enqueue(fn:()=>Promise<void>){const result=this.operation.then(fn);this.operation=result.catch(()=>{});return result;}
}
