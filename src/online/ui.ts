import { uuid } from '../shared/uuid.js';
import { showRoomSettings } from './room-settings-menu.js';
import { validRoomCode } from '../shared/room-code.js';
import { startAttract } from './attract.js';
import { LocalRuntime } from './local-runtime.js';
import type { Callbacks } from './runtime.js';
import { installRoomLifecycle } from './room-lifecycle.js';
import { BOT_ID_PREFIX } from '../shared/bot-controller.js';
import { mountArenaPresentation } from '../client/phaser/presentation.js';
import { apiUrl, appUrl } from './endpoints.js';
import { ControllerInputState } from '../client/controller-state.js';
import { ControllerKeyboardBindings } from '../client/controller-keyboard.js';
import { ControllerPointerBindings } from '../client/controller-pointers.js';
import { drawArena } from '../client/main.js';
import { createAvatarPicker, createAvatarPortrait } from '../client/avatar-heads.js';
import { defaultTheme, loadThemeSprites } from '../client/themes.js';
import { createGameAudio } from '../client/game-audio.js';
import { defaultRoomSettings, loadRoomSettings, SETTINGS_KEY, type RoomSettings } from '../shared/room-settings.js';
import type { PickupType } from '../shared/game.js';
import type { ViewSnapshot } from '../client/snapshot-stream.js';
import type { MatchPlayerStats } from '../shared/match-stats.js';
import { COMPARISON_COLUMNS, COMPARISON_KEY, RECAP_EMPTY_MESSAGE, RECAP_KICKER, RECAP_TITLE, buildMatchRecap } from '../shared/match-recap.js';
import { RoomRuntime } from './runtime.js';
import type { AvatarId } from '../shared/avatars.js';
import QRCode from 'qrcode';
import './online.css';
import { formatNetStats } from './net-stats.js';
import { installMobilePlayLayout } from './mobile-play-layout.js';
import { formatLinkDiagnostics } from './link-diagnostics.js';
import { connectHint } from './connect-hint.js';
import { createJoinCard, createJoinForm } from './join-form.js';
import { safeStorage } from '../client/safe-storage.js';
import { POWERUP_GUIDE } from '../client/powerup-guide.js';
import { createPowerupGuide } from '../client/powerup-guide-view.js';
import { announcementFor, eliminationLine, roundClock } from '../client/arena-announcer.js';
import { plainStatus } from './status-copy.js';
const LAST_ROOM_KEY='fuse-last-room';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage=safeStorage(()=>localStorage);
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
/** Clipboard write with an execCommand fallback. `navigator.clipboard` is secure-context only, so on an
 *  insecure origin it is undefined rather than throwing: only a write that actually ran reports success. */
const copyText=async(text:string)=>{
  const clipboard=navigator.clipboard;
  if(typeof clipboard?.writeText==='function'){try{await clipboard.writeText(text);return true;}catch{/* Fall through to the legacy path below. */}}
  const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.append(field);field.select();
  try{return document.execCommand('copy');}catch{return false;}finally{field.remove();}
};
const labels:Record<string,string>={blast:'Blast radius',triple:'Triple shot',five:'Five shot',gun:'Cannon',shell:'Shell',target:'Target bomb',beer:'Beer',ink:'Ink',stopwatch:'Stopwatch',orbitShield:'Shield',portal:'Portal',star:'Star'};
const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const save=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{}};
const secret=()=>uuid().replaceAll('-','')+uuid().replaceAll('-','');
export async function startOnline():Promise<void>{
  const app=document.querySelector<HTMLElement>('#app')!;app.className='online-app';
  const url=new URL(location.href);const solo=url.searchParams.get('solo')==='1';const code=solo?'SOLO':url.searchParams.get('room')?.toUpperCase();
  if(!code){
    app.classList.add('landing-app');
    const card=node('main','','landing');
    card.innerHTML=`<canvas class="landing-arena" aria-hidden="true"></canvas><div class="landing-shade"></div>
      <header class="landing-top"><a class="landing-brand" href="${appUrl()}">FUSE<span>RIDERS</span></a><div class="landing-top-end"><span class="landing-tag">TINY RIDERS. BIG TROUBLE.</span><button class="landing-audio" type="button">♫ MUSIC ON</button></div></header>
      <section class="landing-content"><p class="landing-eyebrow"><span></span> A NEON ARENA PARTY GAME</p>
      <h1>LEAVE A TRAIL.<br>MAKE A <em>MESS.</em></h1>
      <p class="landing-intro">Outrun your friends. Blow up their plans.<br>One arena. Five riders. Absolutely no brakes.</p>
      <a class="solo-cta" href="${appUrl('?solo=1')}"><span>▶ &nbsp; PLAY SOLO</span><small>YOU VS. FOUR AI RIVALS</small></a>
      <div class="landing-multiplayer"><p class="landing-section-label">OR BRING YOUR FRIENDS</p></div>
      <p class="landing-hint">Phones are your controllers. A TV can be your arena.<br>On the same Wi-Fi? Even better.</p></section>
      <aside class="landing-live"><span class="live-dot"></span> LIVE AI FREE-FOR-ALL <small>Real riders. Real explosions.</small></aside>
      <footer class="landing-footer"><span>STEER. CHARGE. RELEASE. SURVIVE.</span><button class="attract-toggle" type="button">Ⅱ PAUSE BACKGROUND</button></footer>`;
    const form=card.querySelector<HTMLElement>('.landing-multiplayer')!;
    const guide=node('section','','landing-guide'),guideTitle=node('h2','POWER-UPS','landing-section-label');guideTitle.id='landing-guide-title';guide.setAttribute('aria-labelledby',guideTitle.id);
    guide.append(guideTitle,createPowerupGuide(POWERUP_GUIDE,{className:'landing-powerups',themeId:defaultTheme.id,offByDefaultNote:'(off by default, enable in room settings)'}).element);card.querySelector('.landing-content')!.append(guide);
    const mode=node('fieldset','','landing-mode');mode.setAttribute('aria-label','Where will you play?');mode.append(node('legend','Where will you play?'));let selectedMode=loadRoomSettings(localStorage).mode;
    for(const [value,label] of [['devices','Each device'],['shared','Shared TV']] as const){const option=node('label'),radio=node('input');radio.type='radio';radio.name='landing-mode';radio.value=value;radio.checked=selectedMode===value;radio.onchange=()=>{selectedMode=value;};option.append(radio,node('span',label));mode.append(option);}
    const create=node('button','CREATE ROOM'),join=node('button','JOIN ROOM'),input=node('input');input.placeholder='Room code';input.maxLength=10;input.autocapitalize='characters';
    const error=node('p');
    create.onclick=async()=>{create.disabled=true;try{const response=await fetch(apiUrl('/api/rooms'),{method:'POST'});const body=await response.json();if(!response.ok)throw new Error(body.error??'Could not create room');save(`fuse-room-${body.code}`,body.token);const settings=loadRoomSettings(localStorage);settings.mode=selectedMode;save(SETTINGS_KEY,JSON.stringify(settings));location.href=appUrl(`?room=${body.code}`);}catch(e){error.textContent=String(e);create.disabled=false;}};
    join.onclick=()=>{const value=input.value.trim().toUpperCase();if(validRoomCode(value))location.href=appUrl(`?room=${value}`);else error.textContent='Enter a room code, for example AB42';};
    mode.setAttribute('aria-label','Where will you play?');input.setAttribute('aria-label','Room code');error.setAttribute('role','alert');
    const createRow=node('div','','landing-create');createRow.append(mode,create);
    const joinRow=node('div','','landing-join');joinRow.append(input,join);input.onkeydown=event=>{if(event.key==='Enter')join.click();};
    // The last room this browser was in is one tap away; a closed room still lands on its ROOM CLOSED card, which forgets it.
    const lastRoom=read(LAST_ROOM_KEY);if(lastRoom&&validRoomCode(lastRoom)){const rejoin=node('button',`REJOIN ${lastRoom}`,'landing-rejoin');rejoin.title='Return to the room you were in last';rejoin.onclick=()=>{location.href=appUrl(`?room=${lastRoom}`);};joinRow.append(rejoin);}
    form.append(createRow,joinRow,error);app.replaceChildren(card);
    let cleanup:(()=>void)|undefined,ended=false;
    window.addEventListener('pagehide',()=>{ended=true;cleanup?.();},{once:true});
    window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
    // The landing page has no room and no snapshots, so its music is background music the toggle owns outright.
    const landingAudio=createGameAudio('Site',{background:true});landingAudio.bindMusicToggle(card.querySelector<HTMLButtonElement>('.landing-audio')!);
    card.querySelector('.landing-audio')!.before(landingAudio.controls);
    void startAttract(card.querySelector('canvas')!,card.querySelector('.attract-toggle')!).then(stop=>{if(ended)stop();else cleanup=stop;}).catch(()=>{card.querySelector('.landing-live')?.remove();});return;
  }
  if(!solo&&!validRoomCode(code)){app.textContent='Invalid room code';return;}
  const displayOnly=!solo&&url.searchParams.has('display');
  // CREATE ROOM is the only writer of fuse-room-<code>: its presence makes this browser the host's. Everyone else is a joiner with a separate peer identity.
  const hostToken=solo||displayOnly?null:read(`fuse-room-${code}`);
  const role:'solo'|'display'|'host'|'joiner'=solo?'solo':displayOnly?'display':hostToken?'host':'joiner';
  const token=solo?'':displayOnly?secret():hostToken||peerToken();
  function peerToken(){const key=`fuse-peer-${code}`;const token=read(key)||secret();save(key,token);return token;}
  const forgetHostToken=()=>storage.removeItem(`fuse-room-${code}`);
  if(!solo&&!displayOnly)save(LAST_ROOM_KEY,code);
  let id='',isHost=false,joined=false,settings=loadRoomSettings(localStorage),snapshot:ViewSnapshot|undefined;
  const frameTimes:number[]=[];const inputTimes:number[]=[];let previousFrame=performance.now(),inputAt=0;
  let lastRecap='',rejoinPending=false;
  const responseBenchmark=url.searchParams.get('responseBenchmark')==='1';
  const benchmark=url.searchParams.get('benchmark')==='1'||responseBenchmark;let benchmarkInput:{seq:number;at:number}|undefined,lastBenchmarkRender=0,lastControls='';
  const sample=(detail:object)=>{if(benchmark)window.dispatchEvent(new CustomEvent('fuse-benchmark',{detail}));};
  // A terminal room close (4004) freezes this client: no further snapshots are applied and no input may leave, whatever a stale pointer or key does next.
  let roomEnded=false;
  const header=node('header','','online-header');const title=node('strong','','room-brand'),status=node('span','Connecting…','online-status'),audioButton=node('button','♫ RADIO'),musicButton=node('button','♫ MUSIC OFF'),results=node('button','RESULTS'),menu=node('button',solo?'EXIT':'ROOM');
  // Players read three link states (connected / connecting / trouble); the runtime's full wording stays in the tooltip and the ROOM diagnostics.
  const statusAction=node('button','RETRY','online-status-action');statusAction.hidden=true;statusAction.onclick=()=>location.reload();
  const roundChip=node('span','','online-round');roundChip.hidden=true;
  let rawStatus='',replacedHost=false;
  title.append(node('span','FUSE'),node('span','RIDERS'));title.setAttribute('aria-label',`Fuse Riders · ${code}`);results.hidden=true;results.title='Reopen the match results';header.append(title,status,statusAction,roundChip,audioButton,musicButton,results,menu);
  const joinForm=createJoinForm(storage,(playerName,avatarId)=>runtime.command({type:'join',name:playerName,avatarId}));
  const bootNote=node('p','Warming up the arena…','room-boot-note');
  const booting=node('div','','room-boot');booting.setAttribute('role','status');booting.append(node('p','PREPARING ROOM','room-boot-title'),node('strong',code,'shared-room-code'));
  // A joiner never mounts the host's boot card or QR lobby: until it holds a seat its whole page is the join card, with the same connect hint under the form.
  const joinPanel=role==='joiner'?createJoinCard(code,joinForm.element,bootNote):joinForm.element;if(role!=='joiner')booting.append(bootNote);
  // A room that never sends a snapshot must stop claiming progress: the note escalates to the same-network hint once the link stalls or ICE fails.
  const bootAt=performance.now();const bootTick=()=>{bootNote.textContent=connectHint(rawStatus,performance.now()-bootAt);};
  const bootPoll=setInterval(bootTick,1000);
  const bootDone=()=>{if(!bootNote.isConnected)return;clearInterval(bootPoll);booting.remove();bootNote.remove();app.classList.remove('booting');};
  const overCard=node('div','','room-boot room-over-card'),overNote=node('p','Room ended — return to menu to start again','room-boot-note'),overHome=node('a','BACK TO MENU','room-over-home');
  overCard.setAttribute('role','status');overHome.href=appUrl();overCard.append(node('p','ROOM CLOSED','room-boot-title'),node('strong',code,'shared-room-code'),overNote,overHome);
  app.classList.toggle('booting',role!=='joiner');app.classList.toggle('joining',role==='joiner');
  app.replaceChildren(header,role==='joiner'?joinPanel:booting);
  let canvas=node('canvas','','online-arena');let renderScope=code;const presentation=mountArenaPresentation(canvas,drawArena,replacement=>{canvas=replacement;});const sprites=await loadThemeSprites(defaultTheme);
  const notice=node('div','','online-notice');
  // In-arena moments (countdown, round result, overtime, final) and the elimination feed, shared by desktop, solo and the phone thirds.
  const announcer=node('div','','online-announce');announcer.hidden=true;
  const announceSmall=node('span','','announce-small'),announceBig=node('strong'),announceRows=node('div','','announce-rows'),announceHint=node('p','','announce-hint'),announceAction=node('button','PLAY AGAIN','announce-action');announceAction.hidden=true;
  announceBig.setAttribute('aria-live','polite');announceBig.setAttribute('aria-atomic','true');
  announcer.append(announceSmall,announceBig,announceRows,announceHint,announceAction);
  const feed=node('div','','online-feed');feed.setAttribute('aria-live','polite');
  const hud=node('div','','mobile-hud');const hudWho=node('span','','hud-who'),hudFire=node('span','','hud-fire'),hudWins=node('span','','hud-wins'),hudRound=node('span','','hud-round');hud.append(hudWho,hudFire,hudWins,hudRound);
  let hudAvatar:AvatarId|undefined;
  let lastAnnouncement='';const touchInput=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
  const showAnnouncement=(state:ViewSnapshot,visible:boolean)=>{
    const announcement=announcementFor(state,id,touchInput);
    const key=JSON.stringify(announcement)+visible+isHost;
    if(key===lastAnnouncement)return;lastAnnouncement=key;
    announcer.hidden=!visible||announcement.kind==='hidden';announcer.className='online-announce';if(announcement.kind!=='hidden')announcer.classList.add(announcement.kind);app.classList.toggle('announcing',!announcer.hidden);
    announceRows.replaceChildren();announceHint.textContent='';announceAction.hidden=true;
    if(announcement.kind==='countdown'){announceSmall.textContent=`ROUND ${announcement.round}`;announceBig.textContent=announcement.count;announceHint.textContent=announcement.hint;}
    else if(announcement.kind==='overtime'){announceSmall.textContent='';announceBig.textContent=announcement.text;}
    else if(announcement.kind==='round'){announceSmall.textContent=`ROUND ${announcement.round}`;announceBig.textContent=announcement.title;for(const line of announcement.placements)announceRows.append(node('span',line));announceHint.textContent=announcement.next;}
    else if(announcement.kind==='final'){announceSmall.textContent=announcement.subtitle;announceBig.textContent=announcement.title;announceAction.hidden=!isHost||replacedHost||announcement.subtitle!=='MATCH COMPLETE';}
  };
  const feedLine=(text:string)=>{const line=node('span',text);feed.prepend(line);while(feed.childElementCount>4)feed.lastElementChild?.remove();setTimeout(()=>line.remove(),2600);};
  const shake=()=>{if(canvas.hidden||reducedMotion())return;canvas.animate([{transform:'translate(4px,-3px)',filter:'brightness(1.7)'},{transform:'translate(-4px,3px)'},{transform:'translate(2px,1px)'},{transform:'none',filter:'brightness(1)'}],{duration:220});};
  const sharedLobby=node('section','','shared-lobby room-lobby');sharedLobby.hidden=true;
  const lobbyCopy=node('div','','room-lobby-copy');const lobbyHeading=node('h1');lobbyHeading.innerHTML='SCAN.<br>STEER.<br>SURVIVE.';
  lobbyCopy.append(node('p','PHONE PARTY // 2–5 RIDERS','room-eyebrow'),lobbyHeading,node('p','Pick your avatar. Grab your phone. Carve neon trails and blow up your friends’ plans.','room-intro'),node('p','STEER  ◀ ▶     HOLD · AIM · RELEASE','room-howto'));
  const joinLink=new URL(appUrl(`?room=${code}`),location.origin).href;
  const qrCard=node('div','','room-qr-card'),lobbyQr=node('img');lobbyQr.alt='Scan to join this room';
  // The link lives next to the QR so a rider who cannot scan can still be handed the room: one tap copies it, and the label reports back.
  const linkRow=node('div','','room-qr-link'),linkText=node('span',joinLink,'room-qr-url'),copyLink=node('button','COPY LINK','room-qr-copy');copyLink.type='button';copyLink.title='Copy the join link';linkRow.append(linkText,copyLink);
  let copyReset=0;
  copyLink.onclick=async()=>{const copied=await copyText(joinLink);copyLink.textContent=copied?'COPIED':'COPY FAILED';copyLink.classList.toggle('copied',copied);clearTimeout(copyReset);copyReset=window.setTimeout(()=>{copyLink.textContent='COPY LINK';copyLink.classList.remove('copied');},1600);};
  qrCard.append(lobbyQr,node('p','SCAN TO JOIN'),node('strong',code,'shared-room-code'),...(solo?[]:[linkRow]));qrCard.hidden=solo;
  const lobbyRiders=node('div','','room-riders');const lobbyEmpty=node('p','Your crew belongs here. Share the code to get started.','room-empty');lobbyRiders.append(lobbyEmpty);
  const lobbyFooter=node('footer','','room-lobby-footer'),lobbyCount=node('span','Waiting for riders');lobbyFooter.append(lobbyCount);
  sharedLobby.append(lobbyCopy,qrCard,lobbyRiders,lobbyFooter);
  const lobbyEntries=new Map<string,{entry:HTMLElement;head:HTMLElement;name:HTMLElement;status:HTMLElement;avatar:AvatarId}>();
  if(!solo)void QRCode.toDataURL(joinLink).then(data=>{lobbyQr.src=data;}).catch(()=>{lobbyQr.hidden=true;});
  const controls=node('div','','online-controls');const leftButton=node('button','◀'),fireButton=node('button','HOLD TO FIRE'),rightButton=node('button','▶');controls.append(leftButton,fireButton,rightButton);controls.addEventListener('selectstart',event=>event.preventDefault());controls.addEventListener('contextmenu',event=>event.preventDefault());
  for(const [button,key,label] of [[leftButton,'ArrowLeft A','Steer left'],[fireButton,'Space','Hold to charge, release to fire'],[rightButton,'ArrowRight D','Steer right']] as const){button.setAttribute('aria-keyshortcuts',key);button.title=`${label} (${key})`;}
  const roster=node('div','','online-roster');const hostControls=node('div','','online-host');const start=node('button','START RACE'),reset=node('button','MAIN MENU'),settingsButton=node('button','ROOM SETTINGS'),share=node('button','TV VIEW'),addAI=node('button','ADD AI');hostControls.append(start,reset,settingsButton,share,addAI);
  const rosterEntries=new Map<string,{entry:HTMLElement;label:HTMLElement;head:HTMLElement;avatar:AvatarId;remove:HTMLButtonElement}>();
  const help=node('button','?','desktop-help');help.setAttribute('aria-label','Keyboard controls');help.title='Keyboard controls';
  const avatarButton=node('button','AVATAR'),fullscreen=node('button','⛶');fullscreen.setAttribute('aria-label','Fullscreen');avatarButton.hidden=true;
  // iPhone Safari has no element fullscreen (#142): a button that can do nothing is not shown.
  fullscreen.hidden=!document.fullscreenEnabled;fullscreen.onclick=()=>void (document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen())?.catch(()=>{});header.append(avatarButton,help,fullscreen);
  const dialog=node('dialog','','game-dialog');dialog.setAttribute('aria-label','Game menu');const close=node('button','✕  CLOSE');close.type='button';close.setAttribute('aria-label','CLOSE');close.onclick=()=>dialog.close();const rematch=node('button','REMATCH');rematch.type='button';rematch.hidden=true;rematch.title='Play the same match again';const dialogActions=node('span','','dialog-actions');dialogActions.append(rematch,close);const dialogBar=node('header','','dialog-bar'),dialogTitle=node('strong','GAME MENU');dialogBar.append(dialogTitle,dialogActions);const dialogBody=node('div','','dialog-body');dialog.append(dialogBar,dialogBody);dialog.addEventListener('close',()=>{rematch.hidden=true;close.textContent='✕  CLOSE';close.setAttribute('aria-label','CLOSE');dialog.classList.remove('recap-dialog');dialogTitle.textContent='GAME MENU';dialog.setAttribute('aria-label','Game menu');});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  const scoreboard=node('div','','online-scoreboard');scoreboard.append(notice,roster);
  const footer=node('footer','','online-footer');footer.append(controls,hostControls);
  // A joiner's card is already on screen and may hold focus with a half-typed name (#132): build the room around it. Detaching a focused
  // input blurs it, and keystrokes that follow land nowhere, so an early typist lost their name and JOIN sent nothing.
  // header and joinPanel are app's only children here (line 116, and nothing else attaches before this point).
  if(role==='joiner'){header.after(canvas,sharedLobby,scoreboard);joinPanel.after(footer,announcer,feed,hud,dialog);}
  else app.replaceChildren(header,booting,canvas,sharedLobby,scoreboard,joinPanel,footer,announcer,feed,hud,dialog);
  help.onclick=()=>{dialogBody.replaceChildren(node('h2','Keyboard controls'),node('p','← / A — steer left'),node('p','→ / D — steer right'),node('p','SPACE — hold to charge, release to fire'));dialog.showModal();};
  // Move the existing actions, keeping their handlers and mobile/lobby destinations intact.
  const desktopQuery=matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)');
  const updateDesktopLayout=()=>{
    const desktop=desktopQuery.matches&&!app.classList.contains('mobile-play')&&!app.classList.contains('controller-only')&&!app.classList.contains('joining')&&sharedLobby.hidden;
    app.classList.toggle('desktop-game',desktop);
    const rosterParent=desktop?header:scoreboard;
    if(roster.parentElement!==rosterParent){if(desktop)header.insertBefore(roster,audioButton);else scoreboard.append(roster);}
    const actionsParent=!sharedLobby.hidden?lobbyFooter:desktop?header:footer;
    if(hostControls.parentElement!==actionsParent){if(desktop)header.insertBefore(hostControls,audioButton);else actionsParent.append(hostControls);}
    const noticeParent=desktop?header:scoreboard;
    if(notice.parentElement!==noticeParent)noticeParent.append(notice);
  };
  window.addEventListener('resize',updateDesktopLayout);
  desktopQuery.addEventListener('change',updateDesktopLayout);

  const openRadio=()=>{audio.unlock();audio.controls.setAttribute('open','');dialogBody.replaceChildren(node('h2','Fuse Riders Radio'),audio.controls);if(!dialog.open)dialog.showModal();};
  const audio=createGameAudio('Game',{background:true,toggleRadio:()=>{if(!dialog.open)openRadio();else if(dialogBody.contains(audio.controls))dialog.close();/* Another open dialog (results, a settings draft) is left alone. */}});audioButton.onclick=openRadio;
  audio.bindMusicToggle(musicButton); // The same ♫ MUSIC ON / OFF toggle as the landing page, next to the same ♫ RADIO button.
  /** Podium, totals, awards and rider comparison built from the authoritative match statistics. */
  const renderRecap=(stats:ReadonlyArray<MatchPlayerStats>)=>{
    const recap=buildMatchRecap(stats);const root=node('section','','match-recap-report');
    const heading=node('header','','recap-heading'),copy=node('div');copy.append(node('p',RECAP_KICKER,'kicker'),node('h2',RECAP_TITLE));heading.append(copy);root.append(heading);
    if(!recap.comparison.length){root.append(node('p',RECAP_EMPTY_MESSAGE,'recap-empty'));return root;}
    const podium=node('div','','recap-podium');for(const entry of recap.podium){const card=node('article','',`podium-card podium-place-${entry.placement}${entry.playerId===id?' is-you':''}`);card.style.setProperty('--player-color',entry.color);card.append(node('span',entry.placeLabel,'podium-place'),node('strong',entry.name),node('small',entry.winsLabel));podium.append(card);}
    const totals=node('div','','recap-totals');for(const total of recap.totals){const cell=node('div','','recap-total');cell.append(node('strong',total.value),node('small',total.label));totals.append(cell);}
    const awards=node('div','','recap-awards');for(const award of recap.awards){const card=node('article','','award-card');card.append(node('span',award.icon,'award-icon'),node('small',award.title),node('strong',award.winnerText),node('em',award.detail));awards.append(card);}
    const comparison=node('div','','recap-comparison');comparison.append(node('p',COMPARISON_KEY,'comparison-key'));const columns=node('div','','comparison-row comparison-header');for(const label of ['RIDER',...COMPARISON_COLUMNS.map(column=>column.label)])columns.append(node('span',label));comparison.append(columns);
    for(const entry of recap.comparison){const row=node('div','',`comparison-row${entry.playerId===id?' is-you':''}`);row.style.setProperty('--player-color',entry.color);const rider=node('span','','comparison-rider'),riderCopy=node('span');riderCopy.append(node('b',entry.riderLabel),node('small',entry.riderNote));rider.append(node('i'),riderCopy);row.append(rider);for(const column of COMPARISON_COLUMNS)row.append(node(column.key==='wins'?'strong':'span',entry[column.key],column.key==='pickups'?'pickup-counts':column.key==='deaths'?'death-counts':''));comparison.append(row);}
    root.append(podium,totals);if(recap.awards.length)root.append(awards);root.append(comparison);return root;
  };
  const openRecap=()=>{if(!snapshot)return;dialogBody.replaceChildren(renderRecap(snapshot.matchStats));dialogTitle.textContent='MATCH RESULTS';dialog.setAttribute('aria-label','Match results');dialog.classList.add('recap-dialog');rematch.hidden=!isHost;if(!sharedLobby.hidden){close.textContent='BACK TO LOBBY';close.setAttribute('aria-label','BACK TO LOBBY');}dialog.showModal();dialogBody.scrollTop=0;};
  results.onclick=openRecap;
  const callbacks:Callbacks={
    // A host key the server rejects is a stale guest identity from an older build or a reused code: keep the identity under the peer key and re-enter as a joiner.
    ready:(peerId,host)=>{if(role==='host'&&!host){save(`fuse-peer-${code}`,token);forgetHostToken();location.reload();return;}id=peerId;isHost=host;joinForm.ready();hostControls.hidden=!host;},
    status:text=>{rawStatus=text;const plain=plainStatus(text);status.textContent=plain.text;status.title=text;status.dataset.raw=text;status.dataset.tone=plain.tone;
      // A replaced host tab cannot act on the room any more: its actions go away and one button reclaims hosting (a reload re-authenticates with the stored token).
      const replaced=/replaced/i.test(text);statusAction.hidden=!(plain.retry||replaced);statusAction.textContent=replaced?'TAKE OVER HOSTING':'RETRY';if(replaced){replacedHost=true;hostControls.hidden=true;announceAction.hidden=true;}
      if(bootNote.isConnected)bootTick();if(roomEnded){notice.textContent=text;overNote.textContent=text;}},
    // An ended room is no longer joined play (#44): the thirds controller gives way to the ordinary header so the status
    // reads without opening ☰ MENU. `controller-only` is only ever recomputed from a state update, and none arrives after the end.
    ended:()=>{bootDone();roomEnded=true;if(role==='host')forgetHostToken();if(read(LAST_ROOM_KEY)===code)storage.removeItem(LAST_ROOM_KEY);announcer.hidden=true;hud.hidden=true;app.classList.remove('announcing');clearControls();controls.hidden=true;joinPanel.hidden=true;hostControls.hidden=true;app.classList.add('room-over');app.classList.remove('controller-only');if(canvas.isConnected)canvas.after(overCard);else app.append(overCard);mobileLayout.update({joined,phase:snapshot?.phase??'lobby',displayOnly,host:isHost,ended:true});},
    event:(event,matchId,round,tick)=>{audio.director.message({type:'event',matchId,round,tick,event});
      if(roomEnded)return;
      if(event.type==='explosion')shake();
      const line=eliminationLine(event,snapshot?.players??[],id);if(line){feedLine(line);if(event.type==='playerEliminated'&&event.playerId===id){shake();if(navigator.userActivation?.hasBeenActive)navigator.vibrate?.(180);}}},
    state:(state,rules,matchId)=>{
      if(roomEnded)return;
      bootDone();
      if(snapshot&&snapshot.phase!==state.phase)clearControls();
      snapshot=state;renderScope=`${runtime.transport.grant?.incarnation}:${runtime.transport.grant?.epoch}:${matchId}:${state.round}`;settings=rules;
      sample({kind:'snapshot',at:performance.now(),authorityScope:renderScope,matchId,round:state.round,tick:state.tick,phase:state.phase,playerId:id,heldMotion:runtime.held(id),players:state.players.map(p=>({id:p.id,alive:p.alive,x:p.x,y:p.y,angle:p.angle,bombReadyAtTick:p.bombReadyAtTick,bombChargeStartedTick:p.bombChargeStartedTick})),leaderboard:state.leaderboard});
      audio.director.message({type:'snapshot',matchId,round:state.round,tick:state.tick,state});
      const player=state.players.find(player=>player.id===id);
      // The final-round pause keeps the arena visible until phaseEndsAtTick; the report opens once per match afterwards and stays reopenable.
      const recapReady=state.phase==='matchOver'&&state.tick>=(state.phaseEndsAtTick??0);results.hidden=!recapReady;
      if(state.phase==='lobby')lastRecap='';joined=Boolean(player);const joining=role==='joiner'&&!joined;app.classList.toggle('joining',joining);mobileLayout.update({joined,phase:state.phase,displayOnly,host:isHost,recapReady});joinPanel.hidden=joined||displayOnly;avatarButton.hidden=!joined;/* Before a seat the join form carries the avatar. */controls.hidden=!joined||displayOnly;
      // A rider the host still lists as offline (page reload mid-round, host checkpoint restore) reconnects by itself; anyone absent goes through the join card.
      if(player&&!player.connected&&!displayOnly){if(!rejoinPending){rejoinPending=true;runtime.command({type:'join',name:player.name,avatarId:player.avatarId});}}else rejoinPending=false;
      // A phone in the lobby always gets the lobby card (#134); elsewhere solo and a joined shared-TV phone have none.
      // Once the recap is ready the room is back in the same lobby it started from: closing the results lands on QR, riders and REMATCH / MAIN MENU.
      // Solo and a joined shared-screen rider have no lobby card (their pre-start screen is the arena or the controller), so their button stays CLOSE.
      const phoneLobby=mobileLayout.lobby();
      sharedLobby.hidden=!(state.phase==='lobby'||recapReady)||joining||(!phoneLobby&&(solo||(settings.mode==='shared'&&joined&&!displayOnly)||mobileLayout.active()));app.classList.toggle('room-waiting',!sharedLobby.hidden);
      const readyCount=state.players.filter(p=>p.connected).length;lobbyCount.textContent=readyCount<2?`${readyCount===1?'1 rider ready · ':''}Waiting for at least 2 riders`:`${readyCount} riders ready`;lobbyEmpty.hidden=state.players.length>0;
      for(const [playerId,row] of lobbyEntries)if(!state.players.some(p=>p.id===playerId)){row.entry.remove();lobbyEntries.delete(playerId);}
      for(const p of state.players){let row=lobbyEntries.get(p.id);if(!row){const entry=node('div','','room-rider'),head=createAvatarPortrait(p.avatarId),name=node('strong'),status=node('small'),info=node('div');info.append(name,status);entry.append(head,info);row={entry,head,name,status,avatar:p.avatarId};lobbyEntries.set(p.id,row);lobbyRiders.append(entry);}if(row.avatar!==p.avatarId){const head=createAvatarPortrait(p.avatarId);row.head.replaceWith(head);row.head=head;row.avatar=p.avatarId;}row.entry.style.setProperty('--rider-color',p.color);if(row.name.textContent!==p.name)row.name.textContent=p.name;row.status.textContent=p.connected?'READY':'OFFLINE';}
      roster.hidden=!sharedLobby.hidden;
      const controllerOnly=settings.mode==='shared'&&!displayOnly&&joined&&!phoneLobby;app.classList.toggle('controller-only',controllerOnly);
      canvas.hidden=!sharedLobby.hidden||controllerOnly||joining;updateDesktopLayout();
      // Opened after the layout above so the close button can say where it lands.
      if(recapReady&&lastRecap!==String(state.phaseEndsAtTick)){lastRecap=String(state.phaseEndsAtTick);openRecap();}
      inputState.configureTargetAim(player?.targetBombArmed&&!player.gunArmed&&!player.shellArmed?{x:player.x/state.width,y:player.y/state.height}:undefined);
      if(player){app.style.setProperty('--player-color',player.color);const remaining=Math.max(0,player.bombReadyAtTick-state.tick);fireButton.textContent=remaining?`${Math.ceil(remaining/20)}s RECHARGE`:player.targetBombArmed?'SLIDE TO AIM':player.gunArmed?'FIRE CANNON':player.shellArmed?'FIRE SHELL':inputState.isHeld('bomb')?'RELEASE!':'HOLD TO FIRE';}
      notice.textContent=state.phase==='lobby'?(joined&&!isHost?'Waiting for the host to start':'Join your friends, then start the race'):state.phase==='countdown'?`READY · ${Math.max(0,Math.ceil(((state.phaseEndsAtTick??state.tick)-state.tick)/20))}`:state.phase==='roundOver'?`${state.players.find(p=>p.id===state.roundWinnerId)?.name??'Nobody'} wins this round`:state.phase==='matchOver'?`${state.players.find(p=>p.id===state.matchWinnerId)?.name??'Tie'} · MATCH COMPLETE`:player?.waitingForNextRound?'You’re in — joining next round':!player?.alive&&joined?'Eliminated — next round soon':'';
      for(const [playerId,row] of rosterEntries)if(!state.players.some(p=>p.id===playerId)){row.entry.remove();rosterEntries.delete(playerId);}
      for(const p of state.players){
        let row=rosterEntries.get(p.id);
        if(!row){const entry=node('span','','online-score-card'),label=node('span'),head=createAvatarPortrait(p.avatarId),remove=node('button','×');entry.append(head,label,remove);remove.onclick=()=>runtime.command({type:'bot',action:'remove',id:p.id});row={entry,label,head,avatar:p.avatarId,remove};rosterEntries.set(p.id,row);roster.append(entry);}
        const label=`${p.name} · ${p.roundWins}${p.waitingForNextRound?' · next round':p.connected?'':' · offline'}`;if(row.label.textContent!==label)row.label.textContent=label;row.label.title=`${p.name} · ${p.roundWins} round wins`;row.label.setAttribute('aria-label',row.label.title);row.entry.style.color=p.color;row.entry.style.setProperty('--rider-color',p.color);row.entry.classList.toggle('out',!p.alive&&!['lobby','countdown'].includes(state.phase));
        if(row.avatar!==p.avatarId){const head=createAvatarPortrait(p.avatarId);row.head.replaceWith(head);row.head=head;row.avatar=p.avatarId;}
        const removeParent=sharedLobby.hidden?row.entry:lobbyEntries.get(p.id)!.entry;if(row.remove.parentElement!==removeParent)removeParent.append(row.remove);
        row.remove.hidden=!isHost||!p.id.startsWith(BOT_ID_PREFIX);row.remove.disabled=!['lobby','roundOver','matchOver'].includes(state.phase);row.remove.setAttribute('aria-label',`Remove ${p.name}`);row.remove.title=row.remove.disabled?'Remove AI between rounds or return to menu':'Remove AI rider';
      }
      addAI.disabled=state.players.length>=5;
      const startLabel=state.phase==='matchOver'?'REMATCH':'START RACE';if(start.textContent!==startLabel)start.textContent=startLabel;start.disabled=state.players.filter(p=>p.connected).length<2||!['lobby','matchOver'].includes(state.phase);
      hostControls.hidden=!isHost||replacedHost;reset.disabled=state.phase==='lobby';reset.hidden=phoneLobby;share.hidden=solo||phoneLobby; // MAIN MENU means nothing in the lobby and a phone is never the TV; the phone screen has no room for dead buttons. Solo has no room to show either.
      const clock=roundClock(state);roundChip.textContent=clock;roundChip.hidden=!clock||!sharedLobby.hidden;
      showAnnouncement(state,sharedLobby.hidden&&!joining);
      // Phone HUD: who you are, what the fire button would do, round wins and the clock. The thirds themselves stay transparent.
      hud.hidden=!player||!mobileLayout.active();
      if(player){if(hudAvatar!==player.avatarId){hudWho.replaceChildren(createAvatarPortrait(player.avatarId),node('b','YOU'));hudAvatar=player.avatarId;}hudFire.textContent=state.phase==='playing'&&player.alive?fireButton.textContent??'':player.alive||state.phase!=='playing'?'':'WIPED OUT';hudWins.textContent=`★ ${player.roundWins}`;hudRound.textContent=clock;}
    }
  };
  const runtime=solo?new LocalRuntime(settings,callbacks):new RoomRuntime(code,token,settings,callbacks);
  start.onclick=()=>{void audio.unlock();runtime.command({type:'action',action:snapshot?.phase==='matchOver'?'rematch':'start'});};
  announceAction.onclick=()=>start.click();
  addAI.onclick=()=>runtime.command({type:'bot',action:'add'});
  // Link quality for the player: hidden unless asked for (?stats=1 or the menu), so a bad Wi-Fi is a fact, not a guess.
  const statsPanel=node('pre','','net-stats');statsPanel.hidden=solo||!url.searchParams.has('stats');app.append(statsPanel);
  reset.onclick=()=>runtime.command({type:'action',action:'lobby'});rematch.onclick=()=>{dialog.close();start.click();};menu.onclick=()=>{dialogTitle.textContent=solo?'EXIT':'ROOM';dialog.setAttribute('aria-label',solo?'Exit':'Room');dialogBody.replaceChildren(node('p',solo?'End this solo run?':isHost?'End this room for everyone?':'Leave this room?'));const leave=node('button',solo?'BACK TO MENU':isHost?'END ROOM':'LEAVE ROOM');leave.onclick=async()=>{leave.disabled=true;leave.textContent='LEAVING…';runtime.stop();if(isHost&&!solo){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);try{await fetch(apiUrl(`/api/rooms/${code}/end`),{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:controller.signal,keepalive:true});}catch{/* Host heartbeat expiry also closes the room if the network is unavailable. */}finally{clearTimeout(timer);}forgetHostToken();}if(read(LAST_ROOM_KEY)===code)storage.removeItem(LAST_ROOM_KEY);location.href=appUrl();};dialogBody.append(leave);
    const standings=[...(snapshot?.leaderboard??[])].sort((a,b)=>b.totalScoreUnits-a.totalScoreUnits||b.matchWins-a.matchWins||a.name.localeCompare(b.name));
    if(standings.length){const list=node('div','','session-board');list.append(node('h2','Session standings'));let rank=0,previous:number|undefined;standings.forEach((entry,index)=>{if(entry.totalScoreUnits!==previous)rank=index+1;previous=entry.totalScoreUnits;const row=node('div','','session-row');if(entry.id===id)row.classList.add('is-you');const points=entry.totalScoreUnits/60;row.append(node('b',`#${rank}`),node('span',entry.id===id?`${entry.name} (you)`:entry.name),node('strong',`${Number.isInteger(points)?points:points.toFixed(1)} PTS`),node('small',`${entry.matchWins} ${entry.matchWins===1?'MATCH':'MATCHES'} · ${entry.roundWins} ${entry.roundWins===1?'ROUND':'ROUNDS'}`));list.append(row);});list.append(node('p','Round points: 5 · 3 · 2 · 1 · 0, ties share the place.','session-key'));dialogBody.append(list);}
    if(!solo){const diagnostics=node('pre','','link-diagnostics');diagnostics.textContent=app.dataset.linkDiagnostics??'collecting link diagnostics…';const statsToggle=node('button',statsPanel.hidden?'SHOW NETWORK STATS':'HIDE NETWORK STATS');statsToggle.onclick=()=>{statsPanel.hidden=!statsPanel.hidden;dialog.close();};dialogBody.append(statsToggle,node('p','LINK DIAGNOSTICS (redacted: candidate types and states, no addresses)'),diagnostics);const refresh=setInterval(()=>{if(!dialog.open){clearInterval(refresh);return;}diagnostics.textContent=app.dataset.linkDiagnostics??diagnostics.textContent;},1000);}
    dialog.showModal();};
  avatarButton.onclick=()=>{dialogBody.replaceChildren(node('h2','Your avatar'));const picker=createAvatarPicker(storage,chosen=>{joinForm.picker.sync(chosen);if(joined)runtime.command({type:'avatar',avatarId:chosen});dialog.close();});
    // Avatars other riders already wear are marked, not blocked: two foxes are allowed, but nobody picks one by accident.
    picker.element.querySelectorAll<HTMLButtonElement>('.avatar-option').forEach(option=>{const owner=snapshot?.players.find(p=>p.id!==id&&p.avatarId===option.dataset.avatarId);option.classList.toggle('taken',Boolean(owner));option.title=owner?`${owner.name} has this one`:'';});
    dialogBody.append(picker.element);dialog.showModal();};
  // The lobby card already carries the QR and the copyable link, so this opens the shared-screen display directly instead of a dialog that repeats them.
  share.title='Open this room on a shared screen';share.onclick=()=>{window.open(appUrl(`?room=${code}&display=1`),'_blank','noopener');};
  settingsButton.onclick=()=>{
    showRoomSettings(dialogBody,settings,solo,labels,draft=>{if(!runtime.command({type:'settings',settings:draft}))return false;save(SETTINGS_KEY,JSON.stringify(draft));return true;},()=>dialog.close());
    dialog.showModal();
  };
  const inputState=new ControllerInputState({send:message=>{if(roomEnded)return false;const controlsKey=`${message.left}:${message.right}:${message.bomb}`;if(controlsKey!==lastControls){inputAt=performance.now();benchmarkInput={seq:message.seq,at:inputAt};lastControls=controlsKey;}const sent=runtime.command({type:'input',left:message.left,right:message.right,bomb:message.bomb,...(message.bombAction?{bombAction:message.bombAction}:{}),...(message.aim?{aim:message.aim}:{})});if(benchmark)sample({kind:'input',at:performance.now(),seq:message.seq,left:message.left,right:message.right,bomb:message.bomb,bombAction:message.bombAction,sent});return sent;}});
  const bindings=new ControllerPointerBindings(inputState,[[leftButton,'left'],[fireButton,'bomb'],[rightButton,'right']],window,()=>{},(x,y)=>{
    const target=document.elementFromPoint(x,y);return [leftButton,fireButton,rightButton].find(button=>target===button||Boolean(target&&button.contains(target)));
  });
  const keyboard=new ControllerKeyboardBindings(inputState,()=>joined&&!roomEnded&&!mobileLayout.blocked()&&!dialog.open&&!document.hidden&&!leftButton.disabled&&!Boolean(document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')),()=>{for(const [button,control] of [[leftButton,'left'],[fireButton,'bomb'],[rightButton,'right']] as const)button.classList.toggle('active',inputState.isHeld(control));});
  window.addEventListener('keydown',event=>keyboard.down(event));
  window.addEventListener('keyup',event=>keyboard.up(event));
  const clearControls=()=>{keyboard.clear();bindings.clear(true,true);};
  const mobileLayout=installMobilePlayLayout(app,clearControls);mobileLayout.update({joined:false,phase:'lobby',displayOnly}); // A phone booting a room is already on the lobby screen (#134): the header takes its lobby shape before the first snapshot.
  window.addEventListener('blur',clearControls);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});
  dialog.addEventListener('focusin',clearControls);
  document.addEventListener('focusin',()=>{if(document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))keyboard.clear();});
  new MutationObserver(()=>{if(dialog.open)clearControls();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  window.addEventListener('pagehide',clearControls);
  setInterval(()=>{if(joined&&!roomEnded)inputState.resend();audio.director.update();},50);
  runtime.start();
  if(runtime instanceof RoomRuntime)setInterval(()=>{if(statsPanel.hidden)return;let path='none';try{const m=JSON.parse(app.dataset.metrics??'{}');path=m.direct?'direct':m.relayed?'relay':'none';}catch{}statsPanel.textContent=isHost?`host · ${snapshot?.players.filter(p=>p.connected).length??0} riders connected · stats are per phone: open them on a phone`:formatNetStats(runtime.netStats.summary(),path);},500);
  setInterval(()=>{void runtime.transport.stats().then(connection=>{
    const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]??0;
    app.dataset.metrics=JSON.stringify({...connection,sentBytes:runtime.transport.sentBytes,frameP95:percentile(frameTimes,.95),inputP95:percentile(inputTimes,.95),tick:snapshot?.tick??0});
    return runtime instanceof RoomRuntime?runtime.transport.diagnostics():undefined;
  }).then(report=>{if(report)app.dataset.linkDiagnostics=formatLinkDiagnostics(report.links,report.ice,report.socket);});},1000);
  function frame(){const now=performance.now();frameTimes.push(now-previousFrame);previousFrame=now;if(frameTimes.length>300)frameTimes.shift();if(inputAt){inputTimes.push(now-inputAt);inputAt=0;if(inputTimes.length>100)inputTimes.shift();}const predicted=runtime.render();if(predicted&&(!canvas.hidden||(!sharedLobby.hidden&&!canvas.dataset.renderer))){presentation.render(predicted,now,defaultTheme,sprites,renderScope,id);if(responseBenchmark&&canvas.dataset.renderer?.startsWith('phaser-')&&canvas.dataset.rendererStatus!=='context-lost')sample({kind:'response-render',epochAt:performance.timeOrigin+performance.now(),scope:renderScope,phase:predicted.phase,tick:predicted.tick,powerupsDisabled:Object.values(settings.weights).every(weight=>weight===0),players:predicted.players.map(p=>({id:p.id,angle:p.angle,alive:p.alive,drunkUntilTick:p.drunkUntilTick,invulnerableUntilTick:p.invulnerableUntilTick,portalCooldownUntilTick:p.portalCooldownUntilTick,shielded:p.shielded}))});if(benchmark&&(benchmarkInput||now-lastBenchmarkRender>=100)){const p=predicted.players.find(p=>p.id===id);sample({kind:'prediction',renderAt:now,tick:predicted.tick,inputSeq:benchmarkInput?.seq,inputAt:benchmarkInput?.at,pose:p?{x:p.x,y:p.y,angle:p.angle}:undefined});benchmarkInput=undefined;lastBenchmarkRender=now;}}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  installRoomLifecycle(window,{stop:()=>runtime.stop(),destroy:()=>presentation.destroy(),reload:()=>location.reload()});
}
