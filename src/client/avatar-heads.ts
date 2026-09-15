import { assetUrl } from './asset-url.js';
import { AVATARS, AVATAR_ATLAS_URL, DEFAULT_AVATAR, avatarCell, isAvatarId, type AvatarId } from '../shared/avatars.js';
import './avatar-heads.css';

let atlas: HTMLImageElement | undefined;
export function drawAvatarHead(ctx: CanvasRenderingContext2D, id: AvatarId, x: number, y: number, angle: number, color: string): boolean {
  if (!atlas) { atlas = new Image(); atlas.src = assetUrl(AVATAR_ATLAS_URL); }
  if (!atlas.complete || atlas.naturalWidth === 0) return false;
  const { column, row } = avatarCell(id);
  const width = atlas.naturalWidth / 5; const height = atlas.naturalHeight / 2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#080c22'; ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.drawImage(atlas, column * width, row * height, width, height, -22, -22, 44, 44);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(29, 0); ctx.lineTo(20, -6); ctx.lineTo(20, 6); ctx.closePath(); ctx.fill();
  ctx.restore(); return true;
}

export function createAvatarPortrait(id: AvatarId): HTMLSpanElement {
  const portrait = document.createElement('span');
  portrait.className = 'avatar-portrait'; portrait.style.backgroundImage = `url("${assetUrl(AVATAR_ATLAS_URL)}")`;
  portrait.dataset.avatarId = id;
  portrait.setAttribute('role', 'img');
  portrait.setAttribute('aria-label', `${AVATARS.find(avatar => avatar.id === id)?.label ?? 'Robot'} avatar`);
  const { column, row } = avatarCell(id);
  portrait.style.backgroundPosition = `${column * 25}% ${row * 100}%`;
  return portrait;
}

export function createAvatarPicker(storage: Pick<Storage, 'getItem' | 'setItem'>, onChange?: (id: AvatarId) => void): { element: HTMLElement; selected: () => AvatarId; sync: (id: AvatarId) => void } {
  const stored = storage.getItem('fuse-riders-avatar');
  let selected: AvatarId = isAvatarId(stored) ? stored : DEFAULT_AVATAR;
  const element = document.createElement('fieldset'); element.className = 'avatar-picker';
  const legend = document.createElement('legend'); legend.textContent = 'Choose your avatar'; element.append(legend);
  const options = document.createElement('div'); options.className = 'avatar-options'; element.append(options);
  const buttons: HTMLButtonElement[] = [];
  for (const avatar of AVATARS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'avatar-option';
    button.setAttribute('aria-label', avatar.label); button.setAttribute('aria-pressed', String(avatar.id === selected)); button.dataset.avatarId = avatar.id;
    const portrait = document.createElement('span'); portrait.className = 'avatar-portrait'; portrait.style.backgroundImage = `url("${assetUrl(AVATAR_ATLAS_URL)}")`; portrait.setAttribute('aria-hidden', 'true');
    const { column, row } = avatarCell(avatar.id); portrait.style.backgroundPosition = `${column * 25}% ${row * 100}%`;
    const label = document.createElement('span'); label.textContent = avatar.label;
    button.append(portrait, label); buttons.push(button); options.append(button);
    button.addEventListener('click', () => {
      selected = avatar.id; storage.setItem('fuse-riders-avatar', selected);
      for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
      onChange?.(selected);
    });
  }
  return { element, selected: () => selected, sync: id => {
    if (selected === id) return;
    selected = id; storage.setItem('fuse-riders-avatar', id);
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(AVATARS[index].id === id)));
  } };
}
