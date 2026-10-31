const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const characterAvatars = {
  "Wyatt Earp": "https://www.slantmagazine.com/assets/house/lists/15famousmustaches_17.jpg",
  "Doc Holliday": "https://m.media-amazon.com/images/M/MV5BYmUwMjAxNDEtNzg4NC00NDE4LTllZDYtNDQ4MWU3OWIzNmEzXkEyXkFqcGc%40._V1_.jpg",
  "Virgil Earp": "https://www.looper.com/img/gallery/what-virgil-earp-from-tombstone-is-doing-today/l-intro-1621367919.jpg",
  "Morgan Earp": "https://i.pinimg.com/736x/ee/54/e5/ee54e5a5ceb9c210b633b55cf07ff9c6.jpg",
  "Johnny Ringo": "https://m.media-amazon.com/images/M/MV5BZmJmYzYyMGYtODZjNi00ODY2LTg2OTEtZjcxZTQ4YjY1NmI3XkEyXkFqcGc%40._V1_.jpg",
  "Curly Bill Brocius": "https://i.pinimg.com/originals/ef/02/be/ef02be204940f77864cd90af4ffb46f5.jpg",
  "Big Nose Kate": "https://i.pinimg.com/originals/90/e7/c8/90e7c856537bc9de47ec2992c0f15f09.jpg",
  "Josephine Marcus": "https://i-viaplay-com.akamaized.net/viaplay-prod/850/284/1673434541-6cb7fa3d7f4bcb92aef41f6ffea2f0aa4f3c63ca.jpg?height=900&width=1600",
  "Billy Clanton": "https://cdn.mos.cms.futurecdn.net/DRbQX4Q5DGvu99rSQwsi7M.jpg",
  "Ike Clanton": "https://ilarge.lisimg.com/image/27664971/1118full-tombstone-%281993%29-screenshot.jpg"
};
const avatarFor = (character, supplied) => characterAvatars[character] || supplied || "";
const makeDeck = () => {
  const d = [];
  for (const s of suits) for (const r of ranks) d.push({r,s,id:r+s});
  return d.sort(() => Math.random() - 0.5);
};
const code = () => Math.random().toString(36).slice(2,6).toUpperCase();
const publicRoom = room => ({
  code: room.code, hostId: room.hostId, started: room.started, turn: room.turn,
  targetRank: room.targetRank, pileCount: room.pile.length, lastPlay: room.lastPlay,
  challenge: room.challenge, winner: room.winner,
  quickDrawActive: !!room.quickDraw && ["countdown","go","result"].includes(room.quickDraw.phase),
  players: room.players.map((p,i)=>({id:p.id,name:p.name,character:p.character,avatar:avatarFor(p.character,p.avatar),handCount:p.hand.length,ready:p.ready,isBot:!!p.isBot,connected:!!p.isBot||io.sockets.sockets.has(p.id),skipNextTurn:!!p.skipNextTurn,index:i}))
});
function emitRoom(room) {
  io.to(room.code).emit("state", publicRoom(room));
  for (const p of room.players) io.to(p.id).emit("hand", {hand:p.hand, yourTurn:room.started && room.players[room.turn]?.id===p.id, host:room.hostId===p.id});
}
function findRoom(socket) { return [...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); }
function normalizeTurn(room) {
  let guard=0;
  while(room.players[room.turn]?.skipNextTurn && guard<room.players.length) {
    const skipped=room.players[room.turn];
    skipped.skipNextTurn=false;
    io.to(room.code).emit("notice",`${skipped.character||skipped.name} loses this turn after losing You're a Cheat Quick Draw!`);
    room.turn=(room.turn+1)%room.players.length;
    guard++;
  }
}
function advanceTurn(room) {
  room.turn=(room.turn+1)%room.players.length;
  normalizeTurn(room);
}
function quickDrawInProgress(room) {
  return !!room.quickDraw && ["countdown","go","result"].includes(room.quickDraw.phase);
}
function resetGame(room) {
  const deck=makeDeck(); room.players.forEach(p=>{p.hand=[];p.skipNextTurn=false;});
  deck.forEach((c,i)=>room.players[i%room.players.length].hand.push(c));
  room.players.forEach(p=>p.hand.sort((a,b)=>ranks.indexOf(a.r)-ranks.indexOf(b.r)));
  room.pile=[]; room.lastPlay=null; room.challenge=null; room.winner=null;
  room.targetRank="A"; room.turn=0; room.started=true; room.quickDraw=null;
}
function finishChallenge(room, challenger) {
  if(!room.lastPlay || room.winner) return null;
  const last=room.lastPlay;
  const playedCards=room.pile.slice(-last.count);
  const bluff=playedCards.some(c=>c.r!==last.claim);
  const loser=bluff?room.players.find(x=>x.id===last.playerId):challenger;
  loser.hand.push(...room.pile); room.pile=[];
  room.lastPlay=null;
  room.turn=room.players.findIndex(x=>x.id===loser.id);
  normalizeTurn(room);
  if(room.players.some(x=>x.hand.length===0)) room.winner=room.players.find(x=>x.hand.length===0).id;
  io.to(room.code).emit("notice",bluff?`BLUFF CAUGHT! ${last.name} takes the pile.`:`They told the truth! ${challenger.name} takes the pile.`);
  emitRoom(room);
  return {result:bluff?"caught":"truth",loser:loser.name};
}
function acceptClaim(room, responder) {
  if(!room?.lastPlay || room.winner) return {ok:false,error:"There is no claim waiting for a response."};
  const claim=room.lastPlay;
  room.lastPlay=null;
  // A final play only wins after the next player accepts it or a challenge fails.
  if(room.players.find(p=>p.id===claim.playerId)?.hand.length===0) {
    room.winner=claim.playerId;
    io.to(room.code).emit("notice",`${responder.name} accepted the final claim. ${claim.name} wins the game!`);
  } else {
    io.to(room.code).emit("notice",`${responder.name} accepted the claim. It's their turn to play.`);
  }
  emitRoom(room);
  return {ok:true};
}
function scheduleBotTurn(room) {
  if(!room || !room.started || room.winner || quickDrawInProgress(room)) return;
  const player=room.players[room.turn];
  if(!player?.isBot) return;
  setTimeout(()=>{
    if(!room.started || room.winner || quickDrawInProgress(room) || room.players[room.turn]?.id!==player.id) return;
    // When a claim is pending, bots explicitly accept or challenge before playing.
    if(room.lastPlay) {
      if(Math.random()<0.28) {
        finishChallenge(room, player);
        scheduleBotTurn(room);
        return;
      }
      acceptClaim(room, player);
      if(room.winner) return;
    }
    if(!player.hand.length) return;
    const card=player.hand.splice(Math.floor(Math.random()*player.hand.length),1)[0];
    const bluff=Math.random()<0.22;
    const claim=bluff ? ranks[(ranks.indexOf(room.targetRank)+1+Math.floor(Math.random()*12))%ranks.length] : room.targetRank;
    room.pile.push(card);
    room.lastPlay={playerId:player.id,name:player.name,count:1,claim,truth:card.r===claim};
    room.targetRank=ranks[(ranks.indexOf(claim)+1)%ranks.length];
    advanceTurn(room);
    io.to(room.code).emit("notice",`${player.name} played 1 card and claimed ${claim}. The next player must accept or call bluff.`);
    emitRoom(room);
    scheduleBotTurn(room);
  }, 900);
}
function resolveQuickDraw(room, winnerId, reason){
  const match=room?.quickDraw;
  if(!match || !["countdown","go"].includes(match.phase)) return;
  match.phase="result";
  const loserId=winnerId ? match.playerIds.find(id=>id!==winnerId) : null;
  const loser=loserId ? room.players.find(p=>p.id===loserId) : null;
  if(loser) {
    loser.skipNextTurn=true;
    // If the loser currently owns the turn, apply the penalty immediately.
    normalizeTurn(room);
  }
  const winningPlayer=room.players.find(p=>p.id===winnerId);
  io.to(room.code).emit("quickDrawResult",{
    winner:winnerId||null, loser:loserId, loserName:loser?.character||loser?.name||null,
    reason, skipTurn:!!loser
  });
  if(winningPlayer) io.to(room.code).emit("notice",`${winningPlayer.character||winningPlayer.name} wins You're a Cheat Quick Draw! ${loser?.character||loser?.name||"The opponent"} will skip a turn.`);
  emitRoom(room);
}

io.on("connection", socket=>{
  socket.on("createRoom", ({name,character,avatar}, cb)=>{
    let c=code(); while(rooms.has(c)) c=code();
    const room={code:c,hostId:socket.id,players:[{id:socket.id,name:String(name||character||"Player 1").slice(0,18),character:String(character||"Wyatt Earp").slice(0,30),avatar:avatarFor(character,avatar),hand:[],ready:true}],started:false,turn:0,targetRank:"A",pile:[],lastPlay:null,challenge:null,winner:null,quickDraw:null};
    rooms.set(c,room); socket.join(c); cb?.({ok:true,code:c}); emitRoom(room);
  });
  socket.on("joinRoom", ({code:c,name,character,avatar}, cb)=>{
    const room=rooms.get(String(c||"").toUpperCase());
    if(!room) return cb?.({ok:false,error:"Room not found. Check the code."});
    if(room.started) return cb?.({ok:false,error:"That game has already started."});
    if(room.players.length>=5) return cb?.({ok:false,error:"Room is full (5 players max)."});
    if(room.players.some(p=>p.id===socket.id)) return cb?.({ok:true,code:room.code});
    room.players.push({id:socket.id,name:String(name||character||`Player ${room.players.length+1}`).slice(0,18),character:String(character||"Wyatt Earp").slice(0,30),avatar:avatarFor(character,avatar),hand:[],ready:true});
    socket.join(room.code); cb?.({ok:true,code:room.code}); emitRoom(room);
  });
  socket.on("addTestPlayer", cb=>{
    const room=findRoom(socket);
    if(!room || room.hostId!==socket.id) return cb?.({ok:false,error:"Only the host can add a test player."});
    if(room.started) return cb?.({ok:false,error:"Add test players before dealing the cards."});
    if(room.players.length>=5) return cb?.({ok:false,error:"Room is full (5 players max)."});
    const characters=["Wyatt Earp","Doc Holliday","Virgil Earp","Morgan Earp","Johnny Ringo","Curly Bill Brocius","Ike Clanton","Big Nose Kate","Josephine Marcus","Billy Clanton"];
    const used=new Set(room.players.map(p=>p.character));
    const character=characters.find(c=>!used.has(c)) || "Tombstone Test Bot";
    const bot={id:`bot-${room.code}-${Date.now()}`,name:"Test Player",character,avatar:avatarFor(character),hand:[],ready:true,isBot:true};
    room.players.push(bot);
    cb?.({ok:true}); emitRoom(room);
  });
  socket.on("startGame", cb=>{
    const room=findRoom(socket); if(!room||room.hostId!==socket.id) return;
    if(room.players.length<2) return cb?.({ok:false,error:"Invite at least one more player first."});
    resetGame(room); cb?.({ok:true}); emitRoom(room);
    io.to(room.code).emit("notice","Cards dealt! Play one or more cards and claim the current rank. You can tell the truth—or bluff.");
    scheduleBotTurn(room);
  });
  socket.on("playCards", ({ids,claim}, cb)=>{
    const room=findRoom(socket); if(!room||!room.started||room.challenge||room.winner) return cb?.({ok:false,error:"The game is not accepting a play right now."});
    if(quickDrawInProgress(room)) return cb?.({ok:false,error:"The Quick Draw showdown has paused the game."});
    const p=room.players[room.turn]; if(!p||p.id!==socket.id) return cb?.({ok:false,error:"It's not your turn."});
    if(!Array.isArray(ids)||ids.length<1||ids.length>4||new Set(ids).size!==ids.length) return cb?.({ok:false,error:"Choose 1–4 cards."});
    if(!ids.every(id=>p.hand.some(c=>c.id===id))) return cb?.({ok:false,error:"Those cards aren't in your hand."});
    if(!ranks.includes(claim)) return cb?.({ok:false,error:"Choose a rank."});
    const played=ids.map(id=>p.hand.find(c=>c.id===id));
    p.hand=p.hand.filter(c=>!ids.includes(c.id));
    room.pile.push(...played);
    room.lastPlay={playerId:p.id,name:p.name,count:played.length,claim,truth:played.every(c=>c.r===claim)};
    room.targetRank=ranks[(ranks.indexOf(claim)+1)%ranks.length];
    advanceTurn(room);
    cb?.({ok:true});
    io.to(room.code).emit("notice",`${p.name} played ${played.length} card${played.length>1?"s":""} and claimed ${claim}${played.length>1?"s":""}. The next player must accept or call bluff.`);
    emitRoom(room);
    scheduleBotTurn(room);
  });
  socket.on("challenge", cb=>{
    const room=findRoom(socket); if(!room||!room.started||!room.lastPlay||room.challenge||room.winner) return cb?.({ok:false,error:"There is no claim to challenge right now."});
    if(quickDrawInProgress(room)) return cb?.({ok:false,error:"The Quick Draw showdown has paused the game."});
    const p=room.players[room.turn]; if(!p||p.id!==socket.id) return cb?.({ok:false,error:"Only the next player can challenge."});
    const result=finishChallenge(room,p); cb?.({ok:true,...result});
    scheduleBotTurn(room);
  });
  socket.on("pass", cb=>{
    const room=findRoom(socket); if(!room||!room.started||room.winner) return cb?.({ok:false,error:"The game is not active."});
    if(quickDrawInProgress(room)) return cb?.({ok:false,error:"The Quick Draw showdown has paused the game."});
    if(room.players[room.turn]?.id!==socket.id) return cb?.({ok:false,error:"It's not your turn."});
    if(!room.lastPlay) return cb?.({ok:false,error:"There is no claim waiting to accept."});
    const result=acceptClaim(room, room.players[room.turn]);
    cb?.(result);
    // Accepting clears the pending claim but keeps the responder's turn so they can play.
  });
  socket.on("startQuickDraw", ({playerIds}, cb)=>{
    const room=findRoom(socket);
    if(!room || !room.started || room.winner) return cb?.({ok:false,error:"Quick Draw is available while a game is active."});
    if(quickDrawInProgress(room)) return cb?.({ok:false,error:"A Quick Draw is already in progress."});
    if(!Array.isArray(playerIds) || playerIds.length!==2 || playerIds[0]===playerIds[1]) return cb?.({ok:false,error:"Choose two different players."});
    const duelists=playerIds.map(id=>room.players.find(p=>p.id===id));
    if(duelists.some(p=>!p)) return cb?.({ok:false,error:"Both players must be in this room."});
    const matchId=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    room.quickDraw={id:matchId,playerIds:[...playerIds],phase:"countdown",pausedTurn:room.turn};
    io.to(room.code).emit("quickDrawStarted",{players:duelists.map(p=>({id:p.id,name:p.name,character:p.character,avatar:avatarFor(p.character,p.avatar),isBot:!!p.isBot}))});
    emitRoom(room);
    [3,2,1].forEach((count,index)=>setTimeout(()=>{
      if(!room.quickDraw || room.quickDraw.id!==matchId || room.quickDraw.phase!=="countdown") return;
      io.to(room.code).emit("quickDrawCountdown",{count});
      if(count===1) setTimeout(()=>{
        if(!room.quickDraw || room.quickDraw.id!==matchId || room.quickDraw.phase!=="countdown") return;
        room.quickDraw.phase="go";
        io.to(room.code).emit("quickDrawGo",{});
        duelists.filter(p=>p.isBot).forEach(bot=>setTimeout(()=>resolveQuickDraw(room,bot.id,"draw"),250+Math.random()*1100));
        setTimeout(()=>{
          if(room.quickDraw && room.quickDraw.id===matchId && room.quickDraw.phase==="go") {
            room.quickDraw.phase="result";
            io.to(room.code).emit("quickDrawResult",{winner:null,loser:null,reason:"timeout",skipTurn:false});
            io.to(room.code).emit("notice","Nobody drew before time ran out. No turn penalty this time.");
            emitRoom(room);
          }
        },7000);
      },650);
    },index*850));
    cb?.({ok:true});
  });
  socket.on("closeQuickDraw", cb=>{
    const room=findRoom(socket);
    if(!room || !room.quickDraw || room.quickDraw.phase!=="result") return cb?.({ok:false,error:"The showdown is not ready to close."});
    room.quickDraw=null;
    io.to(room.code).emit("quickDrawClosed",{});
    emitRoom(room);
    cb?.({ok:true});
    scheduleBotTurn(room);
  });
  socket.on("quickDrawFire", (_payload, cb)=>{
    const room=findRoom(socket);
    const match=room?.quickDraw;
    if(!room || !match || !match.playerIds.includes(socket.id) || !["countdown","go"].includes(match.phase)) return cb?.({ok:false,error:"You're not one of the two duelists."});
    if(match.phase==="countdown"){
      const other=match.playerIds.find(id=>id!==socket.id);
      resolveQuickDraw(room,other,"false-start");
      cb?.({ok:true});
      return;
    }
    resolveQuickDraw(room,socket.id,"draw");
    cb?.({ok:true});
  });
  socket.on("disconnect",()=>{
    const room=findRoom(socket); if(!room)return;
    const p=room.players.find(x=>x.id===socket.id); if(!p)return;
    // Keep disconnected seats during a game; remove from a lobby.
    if(!room.started){room.players=room.players.filter(x=>x.id!==socket.id);if(!room.players.length)rooms.delete(room.code);else{if(room.hostId===socket.id)room.hostId=room.players[0].id;emitRoom(room);}}
    else emitRoom(room);
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log(`Bluff Five running at http://localhost:${PORT}`));