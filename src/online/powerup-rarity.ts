import type { PickupType } from '../shared/game.js';
import type { RoomSettings } from '../shared/room-settings.js';
/** Rarity chips and presets for the power-up settings: pure weight arithmetic, no DOM, so it is unit-tested. */
export type Rarity='off'|'rare'|'normal'|'common';
export const RARITIES:readonly Rarity[]=['off','rare','normal','common'];
const SCALE:Record<Rarity,number>={off:0,rare:1/3,normal:1,common:3};
/** Star ships with weight 0, so a rarity for it (or any disabled default) scales the median default weight instead. */
export function weightFor(type:PickupType,rarity:Rarity,defaults:RoomSettings['weights']):number{
  const base=defaults[type]||median(Object.values(defaults).filter(weight=>(weight??0)>0) as number[]);
  return Math.max(0,Math.min(10000,Math.round(base*SCALE[rarity])));
}
/** The chip a weight lights up: exact matches first, then the nearest rarity on a log scale so a hand-typed value still shows where it sits. */
export function rarityOf(type:PickupType,weight:number,defaults:RoomSettings['weights']):Rarity{
  if(weight<=0)return 'off';
  let best:Rarity='normal',distance=Infinity;
  for(const rarity of RARITIES){if(rarity==='off')continue;const target=weightFor(type,rarity,defaults);if(!target)continue;const gap=Math.abs(Math.log(weight/target));if(gap<distance){distance=gap;best=rarity;}}
  return best;
}
function median(values:number[]):number{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]!:1000;}
export const POWERUP_PRESETS:Record<string,(type:PickupType,defaults:RoomSettings['weights'])=>number>={
  'CLASSIC':(type,defaults)=>defaults[type]??0,
  'CHAOS':(type,defaults)=>weightFor(type,'common',defaults),
  'NO POWER-UPS':()=>0,
};
