import {afterEach,it,expect} from 'vitest';
import {WebSocket} from 'ws';
import {createGameServer} from '../../apps/server/src/transport/server';
import type {ServerMessage} from '../../packages/protocol/src/index';
const apps:ReturnType<typeof createGameServer>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
async function setup(graceMs=100){const app=createGameServer({database:':memory:',countdownMs:20,graceMs});apps.push(app);const port=await app.listen(0);return{app,url:`ws://127.0.0.1:${port}/ws`};}
async function client(url:string,token?:string){
  const socket=new WebSocket(url,{origin:'http://127.0.0.1:5173'}),messages:ServerMessage[]=[];let seq=0;
  socket.on('message',data=>messages.push(JSON.parse(data.toString())));await new Promise<void>(resolve=>socket.once('open',resolve));
  const wait=async<T extends ServerMessage['type']>(type:T,predicate:(m:Extract<ServerMessage,{type:T}>)=>boolean=()=>true)=>{
    const end=Date.now()+6000;while(Date.now()<end){const index=messages.findIndex(m=>m.type===type&&predicate(m as Extract<ServerMessage,{type:T}>));if(index>=0)return messages.splice(index,1)[0] as Extract<ServerMessage,{type:T}>;await new Promise(r=>setTimeout(r,5));}throw new Error(`timeout: ${type}`);
  };
  const send=(type:string,data:Record<string,unknown>={})=>{const requestId=`r-${seq++}`;socket.send(JSON.stringify({type,requestId,...data}));return requestId;};
  send('hello',{protocolVersion:1,clientBuild:'test',...(token?{resumeToken:token}:{})});const welcome=await wait('welcome');return{socket,wait,send,welcome,messages};
}
it('enforces host permissions, transfer, two-player start and private NEXT/PRNG',async()=>{
  const{app,url}=await setup();const a=await client(url),b=await client(url);a.send('room.create',{name:'A'});const snapshot=await a.wait('room.snapshot');const code=snapshot.room.code;
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{9}$/);b.send('room.join',{code,displayName:'B'});await b.wait('room.snapshot');
  b.send('room.start');expect((await b.wait('error')).code).toBe('FORBIDDEN');
  a.send('room.transferHost',{targetId:b.welcome.sessionId});await b.wait('room.snapshot',m=>m.room.hostId===b.welcome.sessionId);
  b.send('room.start');const start=await a.wait('match.start');expect(start.self?.queue.length).toBeGreaterThanOrEqual(5);expect(start.players).toHaveLength(2);
  for(const p of start.players){expect(p.state).not.toHaveProperty('queue');expect(p.state).not.toHaveProperty('rng');}
  expect(app.service.rooms.get(code)!.match!.rules).toEqual(snapshot.room.settings);
});
it('resumes the same slot only with a secret token and transfers host after grace',async()=>{
  const{url}=await setup(250);const a=await client(url),b=await client(url);a.send('room.create',{name:'A'});const {room}=await a.wait('room.snapshot');b.send('room.join',{code:room.code,displayName:'B'});await b.wait('room.snapshot');a.socket.close();
  await b.wait('room.snapshot',m=>m.room.members.some(p=>p.id===a.welcome.sessionId&&!p.connected));
  const resumed=await client(url,a.welcome.resumeToken);expect(resumed.welcome.sessionId).toBe(a.welcome.sessionId);expect(resumed.welcome.resumeToken).not.toBe(a.welcome.resumeToken);
  const back=await resumed.wait('room.snapshot');expect(back.room.members).toHaveLength(2);expect(back.room.hostId).toBe(a.welcome.sessionId);
  resumed.socket.close();const transfer=await b.wait('room.snapshot',m=>m.room.hostId===b.welcome.sessionId);expect(transfer.room.members).toHaveLength(1);
});
it('rejects forged input claims and duplicate sequences; late joins spectate',async()=>{
  const{app,url}=await setup();const a=await client(url),b=await client(url);a.send('room.create',{name:'A'});const{room}=await a.wait('room.snapshot');b.send('room.join',{code:room.code,displayName:'B'});await b.wait('room.snapshot');a.send('room.start');const start=await a.wait('match.start');
  const c=await client(url);c.send('room.join',{code:room.code,displayName:'C'});const late=await c.wait('room.snapshot');expect(late.room.members.find(p=>p.id===c.welcome.sessionId)?.spectator).toBe(true);expect((await c.wait('match.start')).self).toBeNull();
  const frame={tick:start.tick+1,seq:0,input:{hard:true}};a.send('input.batch',{matchId:start.matchId,frames:[{...frame,input:{hard:true,attack:100}}]});expect((await a.wait('error')).code).toBe('INVALID_MESSAGE');
  const inputId=a.send('input.batch',{matchId:start.matchId,frames:[frame]});await a.wait('ack',m=>m.requestId===inputId);
  a.send('input.batch',{matchId:start.matchId,frames:[frame]});expect((await a.wait('error')).code).toBe('INPUT_SEQUENCE');expect(app.service.rooms.get(room.code)!.match!.players).toHaveLength(2);
});
it('rejects untrusted origins',async()=>{
  const{url}=await setup();const socket=new WebSocket(url,{origin:'https://evil.example'});await expect(new Promise((resolve,reject)=>{socket.on('open',resolve);socket.on('error',reject);})).rejects.toThrow();
});
