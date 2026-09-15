import { defaultRoomSettings, type RoomSettings } from '../shared/room-settings.js';
import { POWERUP_PRESETS, RARITIES, rarityOf, weightFor } from './powerup-rarity.js';
import { TICK_HZ, type PickupType } from '../shared/game.js';
import { BOMB_MIN_CHARGE_TICKS, BOMB_CHARGE_TICKS_LIMIT } from '../shared/bomb-launch.js';
import './room-settings-menu.css';
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const result=document.createElement(tag);result.textContent=text;return result;};
/** One draft survives submenu navigation; only Save publishes it. */
export function showRoomSettings(body:HTMLElement,settings:RoomSettings,solo:boolean,labels:Record<string,string>,save:(draft:RoomSettings)=>boolean,close:()=>void):void{
  const draft=structuredClone(settings);
  // Typed aim text outlives submenu rebuilds so an off-grid value is still rejected on Save instead of being silently rounded.
  let aimText=String(draft.bombChargeTicks/TICK_HZ);
  const choices=<T extends string>(title:string,value:T,options:readonly (readonly [T,string])[],change:(value:T)=>void,disabled=false)=>{
    const group=element('fieldset');group.className='room-choice';group.disabled=disabled;group.append(element('legend',title));
    for(const [key,text] of options){const label=element('label'),input=element('input');input.type='radio';input.name=title;input.value=key;input.checked=value===key;input.onchange=()=>change(key);label.append(input,element('span',text));group.append(label);}return group;
  };
  const main=()=>{
    body.replaceChildren(element('h2','Room settings'));
    body.append(choices('Screen layout',draft.mode,[['devices','Full game on each device'],['shared','Shared TV + phone controls']],value=>{draft.mode=value;},solo),choices('Match format',draft.match,[['wins','First to N wins'],['rounds','Play N rounds']],value=>{draft.match=value;}));
    const lengthLabel=element('label','Match length'),length=element('input');length.type='number';length.min='1';length.max='20';length.value=String(draft.length);length.setAttribute('aria-label','Match length');length.oninput=()=>{draft.length=Number(length.value);};lengthLabel.append(length);body.append(lengthLabel);
    const aimLabel=element('label','Bomb aim time (seconds)'),aim=element('input');aim.type='number';aim.min=String(BOMB_MIN_CHARGE_TICKS/TICK_HZ);aim.max=String(BOMB_CHARGE_TICKS_LIMIT/TICK_HZ);aim.step=String(1/TICK_HZ);aim.required=true;aim.value=aimText;aim.setAttribute('aria-label','Bomb aim time (seconds)');aim.oninput=()=>{aimText=aim.value;if(aim.checkValidity())draft.bombChargeTicks=Math.round(Number(aim.value)*TICK_HZ);};aimLabel.append(aim);body.append(aimLabel,element('p','Time to reach maximum bomb distance. Lower values aim farther, faster.'));
    const configure=element('button','CONFIGURE POWERUPS');configure.onclick=powerups;body.append(configure,element('p','Gameplay changes apply next round. Match length applies next match.'));
    const error=element('p');error.setAttribute('role','alert');const apply=element('button','SAVE SETTINGS');apply.onclick=()=>{if(!Number.isInteger(draft.length)||draft.length<1||draft.length>20){error.textContent='Choose a match length from 1 to 20.';return;}if(!aim.checkValidity()){error.textContent='Choose a bomb aim time from 0.1 to 2 seconds in steps of 0.05.';return;}if(save(draft))close();else error.textContent='Could not save settings. Check the room connection and try again.';};body.append(error,apply);body.scrollTop=0;
  };
  const powerups=()=>{
    body.replaceChildren(element('h2','Configure powerups'));const back=element('button','← BACK TO ROOM SETTINGS');back.onclick=main;body.append(back,element('p','Tap a rarity per power-up, or pick a preset. The number is the spawn weight; 0 turns a power-up off.'));
    // Presets rewrite every weight; rarity chips scale each power-up's default so "common" always means the same thing across rooms.
    const defaults=defaultRoomSettings().weights;const presetRow=element('div');presetRow.className='powerup-presets';
    const inputs=new Map<string,HTMLInputElement>();const chips=new Map<string,HTMLButtonElement[]>();const percentages=new Map<string,HTMLElement>();
    const recalc=()=>{const total=Object.values(draft.weights).reduce((sum,weight)=>sum+(weight??0),0);for(const [type,output] of percentages)output.textContent=`${total?((draft.weights[type as PickupType]??0)/total*100).toFixed(1):'0'}%`;for(const [type,buttons] of chips){const current=rarityOf(type as PickupType,draft.weights[type as PickupType]??0,defaults);for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.rarity===current));}};
    const setWeight=(type:PickupType,weight:number)=>{draft.weights[type]=weight;const input=inputs.get(type);if(input)input.value=String(weight);recalc();};
    for(const [name,weights] of Object.entries(POWERUP_PRESETS)){const button=element('button',name);button.type='button';button.onclick=()=>{for(const type of Object.keys(labels) as PickupType[])setWeight(type,weights(type,defaults));};presetRow.append(button);}
    body.append(presetRow);
    for(const [type,title] of Object.entries(labels)){
      const row=element('div');row.className='powerup-row';const rarityRow=element('div');rarityRow.className='powerup-rarity';rarityRow.setAttribute('role','group');rarityRow.setAttribute('aria-label',`${title} rarity`);
      const buttons:HTMLButtonElement[]=[];for(const rarity of RARITIES){const chip=element('button',rarity.toUpperCase());chip.type='button';chip.dataset.rarity=rarity;chip.onclick=()=>setWeight(type as PickupType,weightFor(type as PickupType,rarity,defaults));buttons.push(chip);rarityRow.append(chip);}chips.set(type,buttons);
      const label=element('label',title),input=element('input'),percent=element('span');input.type='number';input.min='0';input.max='10000';input.value=String(draft.weights[type as PickupType]??0);input.oninput=()=>{draft.weights[type as PickupType]=Math.max(0,Math.min(10000,Math.round(Number(input.value)||0)));recalc();};label.append(input,percent);percentages.set(type,percent);inputs.set(type,input);
      row.append(label,rarityRow);body.append(row);
    }recalc();body.scrollTop=0;
  };
  main();
}
