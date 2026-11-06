import {createHash,randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import type {WebSocket} from 'ws';
import {clientMessageSchema,PROTOCOL_VERSION,type ClientMessage,type ServerMessage,type RoomSnapshot,type Skill,type BalancePreview} from '../../../../packages/protocol/src/index';
import {rulesSchema,PROJECT_DEFAULT,type Rules} from '../../../../packages/rulesets/src/index';
import {Match} from '../matches/match';
import {Store} from '../persistence/store';
import {assert,ClientError,RateLimit} from '../security/limits';
import {balance,estimateSkills} from './balance';
interface Session {id:string;socket:WebSocket|null;room:string|null;disconnectedAt:number|null;dasMs:number;arrMs:number}
interface RoomMember {id:string;name:string;team:number;ready:boolean;joinedAt:number;spectator:boolean}
interface Room {code:string;name:string;hostId:string;revision:number;status:RoomSnapshot['status'];settings:Rules;members:RoomMember[];password:{salt:Buffer;hash:Buffer}|null;match:Match|null;preview:BalancePreview|null}
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export interface ServiceOptions {countdownMs:number;graceMs:number;maxRooms:number;maxSessions:number}
export class RoomService {
  sessions=new Map<string,Session>();rooms=new Map<string,Room>();limits=new RateLimit();
  constructor(public store:Store,public options:ServiceOptions){}
  send(socket:WebSocket|null|undefined,message:ServerMessage){if(socket?.readyState===1){if(socket.bufferedAmount>2*1024*1024){socket.close(1013,'Slow client');return;}socket.send(JSON.stringify(message));}}
  broadcast(room:Room,message:ServerMessage){for(const member of room.members)this.send(this.sessions.get(member.id)?.socket,message);}
  snapshot(room:Room):RoomSnapshot{
    const skills=estimateSkills(room.members.map(m=>({id:m.id,skill:this.store.skill(m.id)})));
    return{code:room.code,name:room.name,hostId:room.hostId,revision:room.revision,status:room.status,settings:room.settings,passwordProtected:!!room.password,members:room.members.map(m=>({...m,connected:!!this.sessions.get(m.id)?.socket,skill:skills[m.id]}))};
  }
  publish(room:Room){this.broadcast(room,{type:'room.snapshot',room:this.snapshot(room)});}
  room(session:Session){const room=session.room?this.rooms.get(session.room):undefined;assert(room,'NO_ROOM','部屋に参加していません。');return room;}
  host(session:Session,room:Room){assert(room.hostId===session.id,'FORBIDDEN','部屋主だけが操作できます。');}
  lobby(room:Room){assert(room.status==='lobby'||room.status==='results','IN_MATCH','試合中は変更できません。');}
  handle(socket:WebSocket,raw:unknown,ip:string,currentId:string|null):string|null{
    const parsed=clientMessageSchema.safeParse(raw);
    if(!parsed.success){const requestId=raw&&typeof raw==='object'&&'requestId'in raw&&typeof raw.requestId==='string'?raw.requestId.slice(0,100):'invalid';this.send(socket,{type:'error',requestId,code:'INVALID_MESSAGE',message:'通信形式または値が不正です。'});return currentId;}
    const message=parsed.data;
    try{
      if(message.type==='hello'){
        assert(!currentId,'ALREADY_CONNECTED','接続は初期化済みです。');
        let session:Session|undefined;
        if(message.resumeToken){
          const guest=this.store.guest(tokenHash(message.resumeToken));assert(guest&&guest.expires>Date.now(),'INVALID_TOKEN','復帰トークンが失効しています。再接続してください。');
          session=this.sessions.get(guest.id);
          if(!session){session={id:guest.id,socket:null,room:null,disconnectedAt:null,dasMs:150,arrMs:30};this.sessions.set(session.id,session);}
        }else{
          assert(this.sessions.size<this.options.maxSessions,'SERVER_FULL','サーバーが混雑しています。');
          session={id:randomUUID(),socket:null,room:null,disconnectedAt:null,dasMs:150,arrMs:30};this.sessions.set(session.id,session);
        }
        session.socket?.close(4001,'Session resumed');session.socket=socket;session.disconnectedAt=null;
        const token=randomBytes(32).toString('base64url');this.store.saveGuest(session.id,tokenHash(token));
        this.send(socket,{type:'welcome',requestId:message.requestId,sessionId:session.id,resumeToken:token,serverTime:Date.now(),roomCode:session.room,limits:{maxPlayers:10,tickRate:60,resumeSeconds:this.options.graceMs/1000}});
        if(session.room){const room=this.rooms.get(session.room);if(room){this.publish(room);if(room.match&&room.status==='playing')this.send(socket,{type:'match.start',...room.match.frame(session.id)});else if(room.match&&room.status==='countdown')this.send(socket,{type:'match.prepare',matchId:room.match.id,seedCommitment:room.match.commitment,rulesSnapshot:room.match.rules,startAt:room.match.startAt});}}
        return session.id;
      }
      assert(currentId,'HELLO_REQUIRED','最初に接続を初期化してください。');const session=this.sessions.get(currentId)!;
      assert(session.socket===socket,'INVALID_SESSION','無効な接続です。');
      if(message.type==='ping'){this.send(socket,{type:'pong',requestId:message.requestId,clientTime:message.clientTime,serverTime:Date.now()});return currentId;}
      this.dispatch(session,message,ip);
      this.send(socket,{type:'ack',requestId:message.requestId});
    }catch(error){
      this.send(socket,{type:'error',requestId:message.requestId,code:error instanceof ClientError?error.code:'SERVER_ERROR',message:error instanceof ClientError?error.message:'処理に失敗しました。しばらくして再試行してください。'});
      if(!(error instanceof ClientError))console.error('room operation failed',error instanceof Error?error.name:'unknown');
    }
    return currentId;
  }
  dispatch(session:Session,m:Exclude<ClientMessage,{type:'hello'|'ping'}>,ip:string){
    if(m.type==='input.configure'){assert(!session.room||!['playing','countdown'].includes(this.room(session).status),'IN_MATCH','入力設定は試合前に変更してください。');session.dasMs=m.dasMs;session.arrMs=m.arrMs;return;}
    if(m.type==='room.create'){
      assert(!session.room,'ALREADY_IN_ROOM','先に現在の部屋から退出してください。');assert(this.limits.take(`create:${ip}`,1/10,6),'RATE_LIMIT','部屋の作成が多すぎます。');assert(this.rooms.size<this.options.maxRooms,'SERVER_FULL','部屋が満員です。');
      let code:string;do{code=Array.from(randomBytes(9),v=>alphabet[v%alphabet.length]).join('');}while(this.rooms.has(code));
      const settings=rulesSchema.parse(m.settings??{}),salt=randomBytes(16);
      const room:Room={code,name:`${m.name}の部屋`,hostId:session.id,revision:1,status:'lobby',settings,members:[{id:session.id,name:m.name,team:0,ready:false,joinedAt:Date.now(),spectator:false}],password:m.password?{salt,hash:scryptSync(m.password,salt,32)}:null,match:null,preview:null};
      this.rooms.set(code,room);session.room=code;this.publish(room);return;
    }
    if(m.type==='room.join'){
      assert(!session.room,'ALREADY_IN_ROOM','先に現在の部屋から退出してください。');assert(this.limits.take(`join:${ip}`,1/6,10),'RATE_LIMIT','参加試行が多すぎます。少し待ってください。');
      const room=this.rooms.get(m.code);assert(room,'NOT_FOUND','部屋が見つかりません。');assert(room.members.length<room.settings.maxPlayers,'ROOM_FULL','部屋が満員です。');
      if(room.password)assert(timingSafeEqual(room.password.hash,scryptSync(m.password??'',room.password.salt,32)),'BAD_PASSWORD','パスワードが違います。');
      const late=room.status==='countdown'||room.status==='playing';assert(!late||room.settings.allowSpectators&&room.settings.allowLateJoinAsSpectator,'JOIN_CLOSED','試合中の参加を受け付けていません。');
      const teams=Array.from({length:room.settings.teamCount},(_,team)=>({team,count:room.members.filter(m=>m.team===team).length})).sort((a,b)=>a.count-b.count);
      room.members.push({id:session.id,name:m.displayName,team:teams[0].team,ready:false,joinedAt:Date.now(),spectator:late});session.room=room.code;room.revision++;room.preview=null;this.publish(room);
      if(room.match&&room.status==='playing')this.send(session.socket,{type:'match.start',...room.match.frame(session.id)});return;
    }
    const room=this.room(session),member=room.members.find(p=>p.id===session.id)!;
    if(m.type==='room.leave'){this.leave(session);return;}
    if(m.type==='room.return'){if(room.status==='results'){room.status='lobby';room.revision++;for(const m of room.members)m.spectator=false;this.publish(room);}return;}
    if(m.type==='room.ready'){this.lobby(room);member.ready=m.ready;room.revision++;this.publish(room);return;}
    if(m.type==='room.rename'){member.name=m.name;room.revision++;this.publish(room);return;}
    if(m.type==='room.updateSettings'){
      this.host(session,room);assert(m.expectedRevision===room.revision,'REVISION_CONFLICT','部屋の情報が更新されました。再試行してください。');
      const parsed=rulesSchema.safeParse({...room.settings,...m.patch});assert(parsed.success,'INVALID_SETTINGS','ルール設定の値が不正です。');
      assert(parsed.data.maxPlayers>=room.members.length,'INVALID_SETTINGS','参加人数より少ない上限にはできません。');room.settings=parsed.data;room.revision++;room.preview=null;this.publish(room);return;
    }
    if(m.type==='room.transferHost'){
      this.host(session,room);assert(room.members.some(p=>p.id===m.targetId)&&this.sessions.get(m.targetId)?.socket,'INVALID_TARGET','接続中の参加者を指定してください。');room.hostId=m.targetId;room.revision++;this.publish(room);return;
    }
    if(m.type==='room.kick'){this.host(session,room);assert(m.targetId!==session.id,'INVALID_TARGET','自分はキックできません。');const target=this.sessions.get(m.targetId);assert(target?.room===room.code,'INVALID_TARGET','参加者が見つかりません。');this.send(target.socket,{type:'error',requestId:m.requestId,code:'KICKED',message:'部屋から退出しました。'});this.leave(target);return;}
    if(m.type==='team.assign'){
      this.lobby(room);assert(room.hostId===session.id||m.targetId===session.id,'FORBIDDEN','自分以外のチーム変更は部屋主のみ可能です。');
      assert(m.team<room.settings.teamCount,'INVALID_TEAM','チームが存在しません。');const target=room.members.find(p=>p.id===m.targetId);assert(target,'INVALID_TARGET','参加者が見つかりません。');assert(room.members.filter(p=>p.team===m.team&&p.id!==target.id).length<room.settings.maxPlayersPerTeam,'TEAM_FULL','チームが満員です。');target.team=m.team;room.revision++;room.preview=null;this.publish(room);return;
    }
    if(m.type==='team.autobalance.preview'){
      this.host(session,room);this.lobby(room);assert(room.settings.mode==='team'&&room.settings.teamCount>=2,'INVALID_TEAMS','2つ以上のチームを設定してください。');assert(room.members.length>=2,'NOT_ENOUGH_PLAYERS','2人以上で計算してください。');
      assert(this.limits.take(`balance:${session.id}`,1,3),'RATE_LIMIT','計算の回数が多すぎます。');
      assert(room.members.length<=room.settings.teamCount*room.settings.maxPlayersPerTeam,'TEAM_FULL','チームの定員が不足しています。');
      const candidates=balance(this.snapshot(room).members,room.settings.teamCount,room.settings.maxPlayersPerTeam,m.seed,m.headcountPenalty);
      assert(candidates.length,'INVALID_TEAMS','チーム割当を作成できませんでした。');
      room.preview={previewId:randomUUID(),revision:room.revision,...candidates[0],alternatives:candidates};this.send(session.socket,{type:'team.autobalance.result',requestId:m.requestId,preview:room.preview});return;
    }
    if(m.type==='team.autobalance.apply'){
      this.host(session,room);this.lobby(room);const preview=room.preview;assert(preview&&preview.previewId===m.previewId&&preview.revision===room.revision,'STALE_PREVIEW','参加者やルールが変わりました。再計算してください。');
      const choice=preview.alternatives[m.candidate];assert(choice,'INVALID_PREVIEW','候補が見つかりません。');for(const member of room.members)member.team=choice.assignments[member.id];room.revision++;room.preview=null;this.publish(room);return;
    }
    if(m.type==='room.start'){
      this.host(session,room);this.lobby(room);
      const members=room.members.filter(m=>this.sessions.get(m.id)?.socket);assert(members.length>=2,'NOT_ENOUGH_PLAYERS','開始には接続中の2人以上が必要です。');
      assert(!room.settings.requireReady||members.every(m=>m.ready),'NOT_READY','全員のREADYを待ってください。');
      if(room.settings.mode==='team'){
        assert(members.every(m=>m.team<room.settings.teamCount),'INVALID_TEAM','チーム所属を確認してください。');
        const teams=new Set(members.map(m=>m.team));assert(teams.size>=2,'NOT_ENOUGH_TEAMS','2つ以上の非空チームが必要です。');
        for(const team of teams)assert(members.filter(m=>m.team===team).length<=room.settings.maxPlayersPerTeam,'TEAM_FULL','チーム人数の上限を超えています。');
      }
      for(const m of room.members){m.spectator=!members.includes(m);m.ready=false;}
      room.match=new Match(members.map(m=>({...m,dasMs:this.sessions.get(m.id)!.dasMs,arrMs:this.sessions.get(m.id)!.arrMs})),room.settings,Date.now()+this.options.countdownMs);
      room.status='countdown';room.revision++;this.store.start(room.match.id,room.match.rules,room.match.seeds);
      this.broadcast(room,{type:'match.prepare',matchId:room.match.id,seedCommitment:room.match.commitment,rulesSnapshot:room.match.rules,startAt:room.match.startAt});this.publish(room);return;
    }
    const match=room.match;assert(match&&room.status==='playing','NO_MATCH','進行中の試合がありません。');
    const player=match.players.find(p=>p.id===session.id);
    if(m.type==='target.select'){
      assert(player&&player.state.alive,'SPECTATOR','観戦中は照準を変更できません。');const target=match.players.find(p=>p.id===m.targetId);assert(target&&target.state.alive&&target.id!==player.id&&(match.rules.mode!=='team'||target.team!==player.team),'INVALID_TARGET','生存している敵を選択してください。');player.target=target.id;return;
    }
    if(m.type==='input.batch'){
      assert(player&&player.state.alive,'SPECTATOR','観戦中は入力できません。');assert(m.matchId===match.id,'STALE_MATCH','試合が切り替わっています。');assert(player.queue.length+m.frames.length<=120,'INPUT_OVERFLOW','入力が多すぎます。');
      let seq=player.lastSeq,scheduled=player.lastScheduledTick;
      const frames=m.frames.map(frame=>{assert(frame.seq===seq+1,'INPUT_SEQUENCE','入力の順序が不正です。');assert(frame.tick>=match.tick-120&&frame.tick<=match.tick+30,'INPUT_TICK','入力時刻が範囲外です。');seq=frame.seq;scheduled=Math.max(frame.tick,match.tick+1,scheduled+1);assert(scheduled<=match.tick+120,'INPUT_OVERFLOW','入力キューが多すぎます。');return{...frame,tick:scheduled};});
      player.queue.push(...frames);player.lastSeq=seq;player.lastScheduledTick=scheduled;this.store.recordInputs(match.id,match.tick,session.id,{frames});return;
    }
    if(m.type==='state.checksum'){
      assert(m.matchId===match.id,'STALE_MATCH','試合が切り替わっています。');if(player&&player.hashes.has(m.tick)&&player.hashes.get(m.tick)!==m.hash)this.send(session.socket,{type:'state.resync',...match.frame(session.id)});return;
    }
  }
  disconnect(id:string,socket:WebSocket){const session=this.sessions.get(id);if(session?.socket!==socket)return;session.socket=null;session.disconnectedAt=Date.now();if(session.room){const room=this.rooms.get(session.room);if(room){const player=room.match?.players.find(p=>p.id===id);if(player){player.held={};player.queue=[];player.lastSeq=player.ackSeq;player.lastScheduledTick=room.match!.tick;}this.publish(room);}}}
  leave(session:Session){
    if(!session.room)return;const room=this.rooms.get(session.room);session.room=null;if(!room)return;
    room.members=room.members.filter(p=>p.id!==session.id);room.revision++;room.preview=null;
    if(room.match&&['playing','countdown'].includes(room.status)){const p=room.match.players.find(p=>p.id===session.id);if(p)p.state.alive=false;}
    if(room.hostId===session.id)this.transfer(room);
    if(!room.members.length)this.rooms.delete(room.code);else this.publish(room);
  }
  transfer(room:Room){const next=room.members.filter(m=>this.sessions.get(m.id)?.socket).sort((a,b)=>a.joinedAt-b.joinedAt||a.id.localeCompare(b.id))[0];room.hostId=next?.id??room.members[0]?.id??'';}
  tick(now=Date.now()){
    for(const session of this.sessions.values()){
      if(session.disconnectedAt!==null&&now-session.disconnectedAt>=this.options.graceMs){this.leave(session);this.sessions.delete(session.id);}
    }
    for(const room of this.rooms.values()){
      const match=room.match;if(!match)continue;
      if(room.status==='countdown'&&now>=match.startAt){room.status='playing';room.revision++;for(const m of room.members)this.send(this.sessions.get(m.id)?.socket,{type:'match.start',...match.frame(m.id)});this.publish(room);}
      if(room.status!=='playing')continue;
      const targetTick=Math.floor((now-match.startAt)*60/1000);
      for(let n=0;match.tick<targetTick&&n<12&&!match.finished;n++){
        const events=match.advance();for(const e of events)this.broadcast(room,{type:'match.event',matchId:match.id,tick:match.tick,...e});
        if(match.tick%6===0)for(const m of room.members)this.send(this.sessions.get(m.id)?.socket,{type:'match.snapshot',...match.frame(m.id)});
      }
      if(match.finished){room.status='results';room.revision++;this.store.end(match.id,match.standings(),match.rules);this.broadcast(room,{type:'match.end',matchId:match.id,reason:match.players.some(p=>p.state.alive)?'last_alive':'draw',placement:match.standings(),winningTeams:[...new Set(match.players.filter(p=>p.state.alive).map(p=>p.team))],seedReveal:match.seeds});this.publish(room);}
    }
  }
}
