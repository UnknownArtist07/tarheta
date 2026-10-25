import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, AtSign, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, Copy, Download, ExternalLink, Facebook, FileText, Github, Globe2, ImagePlus, Instagram, Link2, Linkedin, Mail,
  MapPin, Menu, MessageCircle, MoreHorizontal, Palette, Pencil, Phone, Plus, QrCode, Share2,
  ShieldCheck, Sparkles, Trash2, Twitter, UserRound, X, Youtube,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { AdminFeedbackPage, FeedbackWidget } from './Feedback.jsx';

const RESERVED = new Set(['admin', 'support', 'login', 'api', 'tarheta', 'help', 'about', 'settings']);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_BY_DATE = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_PROFILE = { name: '', username: '', title: '', organization: '', phone: '', email: '', bio: '', website: '' };
const THEME_PRESETS = {
  midnight: { backgroundColor: '#171a1f', surfaceColor: '#22262b', textColor: '#f4f0e6', accentColor: '#c65b43' },
  paper: { backgroundColor: '#eee9dc', surfaceColor: '#fbf8ef', textColor: '#282923', accentColor: '#a44937' },
  ocean: { backgroundColor: '#10232b', surfaceColor: '#19333d', textColor: '#e8f1ec', accentColor: '#45a7a0' },
  forest: { backgroundColor: '#18251f', surfaceColor: '#24352b', textColor: '#edf0e5', accentColor: '#8aaf73' },
  berry: { backgroundColor: '#281c2a', surfaceColor: '#38273b', textColor: '#f4eaf0', accentColor: '#d478a0' },
};
const DEFAULT_APPEARANCE = {
  preset: 'midnight',
  ...THEME_PRESETS.midnight,
  cardFrontColor: '#f8f4e9',
  cardFrontTextColor: '#252720',
  cardFrontNameColor: '#252720',
  cardFrontTransparent: false,
  cardBackTransparent: false,
  cardFrontLabel: 'TARHETA · PERSONAL ID',
  cardFrontFooter: 'TARHETA.PH',
  cardBackColor: '#313631',
  cardBackTextColor: '#f4f0e6',
  cardBackLabel: 'A FEW WAYS TO REACH ME',
  cardBackFooter: 'GLAD WE CONNECTED',
  cardBackgroundImage: '',
};

const MAX_UPLOAD_FILE_SIZE = 8 * 1024 * 1024;
const MAX_STORED_IMAGE_LENGTH = 800_000;

function isImageDataUrl(value = '') {
  return typeof value === 'string'
    && value.length <= MAX_STORED_IMAGE_LENGTH
    && /^data:image\/jpeg;base64,[a-z\d+/]+=*$/i.test(value);
}

function isSafeImageSource(value = '') {
  return isSafeWebUrl(value) || isImageDataUrl(value);
}

async function optimizeUploadedImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    throw new Error('Choose an image smaller than 8 MB.');
  }
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'));
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const loadedImage = new Image();
    loadedImage.onload = () => resolve(loadedImage);
    loadedImage.onerror = () => reject(new Error('The selected file is not a valid image.'));
    loadedImage.src = source;
  });
  let scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  let quality = 0.82;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the selected image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const optimized = canvas.toDataURL('image/jpeg', quality);
    if (optimized.length <= MAX_STORED_IMAGE_LENGTH) return optimized;
    scale *= 0.8;
    quality = Math.max(0.55, quality - 0.05);
  }
  throw new Error('Image is too large after optimization. Choose a smaller image.');
}

function getScheduleWeekday(schedule) {
  if (WEEKDAYS.includes(schedule.day)) return schedule.day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date || '')) return '';
  const [year, month, day] = schedule.date.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return WEEKDAYS_BY_DATE[date.getDay()];
}

function formatScheduleTime(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
  if (!match) return time || '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function isValidScheduleTimeRange(startTime, endTime) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime)
    && /^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)
    && startTime < endTime;
}

function getAppearance(profile) {
  const saved = profile?.appearance || {};
  const preset = THEME_PRESETS[saved.preset] ? saved.preset : 'midnight';
  const appearance = {
    ...DEFAULT_APPEARANCE,
    ...THEME_PRESETS[preset],
    ...saved,
    preset,
  };
  for (const key of ['backgroundColor', 'surfaceColor', 'textColor', 'accentColor', 'cardFrontColor', 'cardFrontTextColor', 'cardFrontNameColor', 'cardBackColor', 'cardBackTextColor']) {
    if (!/^#[\da-f]{6}$/i.test(appearance[key])) appearance[key] = DEFAULT_APPEARANCE[key] || THEME_PRESETS[preset][key];
  }
  appearance.cardFrontTransparent = Boolean(appearance.cardFrontTransparent);
  appearance.cardBackTransparent = Boolean(appearance.cardBackTransparent);
  appearance.cardBackgroundImage = isSafeImageSource(appearance.cardBackgroundImage) ? appearance.cardBackgroundImage : '';
  return appearance;
}

function appearanceStyle(profile) {
  const appearance = getAppearance(profile);
  return {
    '--ink': appearance.backgroundColor,
    '--ink-soft': appearance.surfaceColor,
    '--paper': appearance.textColor,
    '--coral': appearance.accentColor,
    '--coral-bright': appearance.accentColor,
    '--line': `color-mix(in srgb, ${appearance.textColor} 16%, transparent)`,
  };
}

function AppearancePanel({ profile, onSave }) {
  const [appearance, setAppearance] = useState(() => getAppearance(profile));
  const [imageError, setImageError] = useState('');
  useEffect(() => setAppearance(getAppearance(profile)), [profile.username, profile.appearance]);

  const updatePreset = (preset) => {
    setAppearance((current) => ({
      ...current,
      preset,
      ...(THEME_PRESETS[preset] || {}),
    }));
  };
  const updateField = (event) => {
    const { name } = event.target;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setAppearance((current) => ({ ...current, [name]: value, preset: name.startsWith('card') ? current.preset : 'custom' }));
  };
  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const imageFile = data.cardBackgroundImageUpload;
    const url = String(data.cardBackgroundImage || '').trim();
    let cardBackgroundImage = url || (isImageDataUrl(appearance.cardBackgroundImage) ? appearance.cardBackgroundImage : '');
    setImageError('');
    try {
      if (imageFile instanceof File && imageFile.size) cardBackgroundImage = await optimizeUploadedImage(imageFile);
    } catch (error) {
      console.error('Unable to prepare the personal ID background image.', error);
      setImageError(error.message || 'Could not prepare the selected image.');
      return;
    }
    if (data.removeCardBackgroundImage === 'on' && !url && !(imageFile instanceof File && imageFile.size)) cardBackgroundImage = '';
    onSave({ ...appearance, cardBackgroundImage });
  };

  return (
    <form className="appearance-editor" onSubmit={submit}>
      <div className="collection-heading">
        <div><span className="eyebrow">MAKE IT YOURS</span><h2>Appearance</h2><p>Choose a workspace palette and style both kinds of cards.</p></div>
      </div>
      <section className="appearance-group">
        <div><h3>Whole page theme</h3><p>Changes your signed-in workspace and the public profile visitors see.</p></div>
        <label className="form-field"><span>Color theme</span><select name="preset" value={appearance.preset} onChange={(event) => updatePreset(event.target.value)}><option value="midnight">Midnight</option><option value="paper">Paper</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="berry">Berry</option><option value="custom">Custom colors</option></select></label>
        <div className="appearance-color-row">
          <label className="form-field"><span>Page background</span><input name="backgroundColor" type="color" value={appearance.backgroundColor} onChange={updateField} /></label>
          <label className="form-field"><span>Panel background</span><input name="surfaceColor" type="color" value={appearance.surfaceColor} onChange={updateField} /></label>
          <label className="form-field"><span>Text color</span><input name="textColor" type="color" value={appearance.textColor} onChange={updateField} /></label>
          <label className="form-field"><span>Accent color</span><input name="accentColor" type="color" value={appearance.accentColor} onChange={updateField} /></label>
        </div>
      </section>
      <section className="appearance-group">
        <div><h3>Personal ID / calling card</h3><p>Customize both sides of your card. Your name and role come from your Profile section.</p></div>
        <label className="form-field"><span>Front label</span><input name="cardFrontLabel" maxLength="50" value={appearance.cardFrontLabel} onChange={updateField} /></label>
        <div className="appearance-color-row">
          <label className="form-field"><span>Front color</span><input name="cardFrontColor" type="color" value={appearance.cardFrontColor} onChange={updateField} disabled={appearance.cardFrontTransparent} /></label>
          <label className="form-field"><span>Front text</span><input name="cardFrontTextColor" type="color" value={appearance.cardFrontTextColor} onChange={updateField} /></label>
          <label className="form-field"><span>Name text</span><input name="cardFrontNameColor" type="color" value={appearance.cardFrontNameColor} onChange={updateField} /></label>
          <label className="form-field"><span>Back color</span><input name="cardBackColor" type="color" value={appearance.cardBackColor} onChange={updateField} disabled={appearance.cardBackTransparent} /></label>
          <label className="form-field"><span>Back text</span><input name="cardBackTextColor" type="color" value={appearance.cardBackTextColor} onChange={updateField} /></label>
        </div>
        <label className="visibility-choice"><input name="cardFrontTransparent" type="checkbox" checked={appearance.cardFrontTransparent} onChange={updateField} /><span><strong>Transparent front</strong><small>Show the page behind the front of your calling card.</small></span></label>
        <label className="visibility-choice"><input name="cardBackTransparent" type="checkbox" checked={appearance.cardBackTransparent} onChange={updateField} /><span><strong>Transparent back</strong><small>Show the page behind the back of your calling card.</small></span></label>
        <label className="form-field"><span>Front footer label</span><input name="cardFrontFooter" maxLength="30" value={appearance.cardFrontFooter} onChange={updateField} /></label>
        <label className="form-field"><span>Back label</span><input name="cardBackLabel" maxLength="50" value={appearance.cardBackLabel} onChange={updateField} /></label>
        <label className="form-field"><span>Back footer label</span><input name="cardBackFooter" maxLength="50" value={appearance.cardBackFooter} onChange={updateField} /></label>
        <label className="form-field"><span>Background image URL <i>Optional</i></span><input name="cardBackgroundImage" type="url" value={isSafeWebUrl(appearance.cardBackgroundImage) ? appearance.cardBackgroundImage : ''} onChange={(event) => setAppearance((current) => ({ ...current, cardBackgroundImage: event.target.value }))} placeholder="https://example.com/background.jpg" /></label>
        <label className="form-field"><span>Or upload from your device <i>JPG, PNG, or WebP · up to 8 MB</i></span><input name="cardBackgroundImageUpload" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        {isImageDataUrl(appearance.cardBackgroundImage) && <label className="visibility-choice"><input name="removeCardBackgroundImage" type="checkbox" /><span><strong>Remove uploaded background</strong><small>Leave unchecked to keep the current image.</small></span></label>}
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
      </section>
      <Button variant="coral" type="submit" className="form-submit">Save appearance <Check size={16} /></Button>
    </form>
  );
}

// --- Seed profile ---
const DEMO_PROFILE = {
  username: 'demo',
  name: 'Juan Dela Cruz',
  title: 'Product designer',
  organization: 'Independent creative',
  phone: '09171234567',
  email: 'juan@example.com',
  bio: 'I turn curious questions into useful, thoughtful experiences. Always happy to meet kind people and talk about good design.',
  website: 'https://example.com',
  views: 0,
  cards: [
    { id: 'demo-work', title: 'Selected work', type: 'link', value: 'https://example.com/work', isPublic: true },
    { id: 'demo-writing', title: 'Notes on design', type: 'link', value: 'https://example.com/notes', isPublic: true },
    { id: 'demo-resume', title: 'A little about my work', type: 'document', value: 'https://example.com/resume', isPublic: true },
    { id: 'demo-private', title: 'A private note', type: 'link', value: 'https://example.com/private', isPublic: false },
  ],
};

async function apiRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

// --- Validation, URL, and vCard helpers ---
function initials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0].toUpperCase()).join('') || 'T';
}
function ProfileAvatar({ profile, className = '' }) {
  return <div className={`avatar ${className}`}>{profile.profileImage ? <img src={profile.profileImage} alt={`${profile.name}'s profile`} /> : initials(profile.name)}</div>;
}
function socialIcon(label, url) {
  const platform = `${label} ${url}`.toLowerCase();
  if (platform.includes('instagram')) return Instagram;
  if (platform.includes('facebook') || platform.includes('fb.com')) return Facebook;
  if (platform.includes('linkedin')) return Linkedin;
  if (platform.includes('github')) return Github;
  if (platform.includes('youtube') || platform.includes('youtu.be')) return Youtube;
  if (platform.includes('twitter') || platform.includes('x.com')) return Twitter;
  return Globe2;
}
function getHeadline(profile) {
  return [profile.title, profile.organization].filter(Boolean).join(' · ');
}
function normalizePhone(value = '') {
  const phone = value.replace(/[\s()-]/g, '');
  return /^(?:\+63|0)9\d{9}$/.test(phone) ? phone : '';
}
function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function isSafeWebUrl(value = '') {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
function profileUrl(username) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('u', username);
  return url.href;
}
function changeAddress(username = '', { replace = true, state = {} } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.delete('u');
  url.hash = '';
  if (username) url.searchParams.set('u', username);
  if (replace) {
    window.history.replaceState(state, '', url);
  } else {
    const currentUrl = new URL(window.location.href);
    window.history.replaceState({ tarhetaPage: state.tarhetaPage }, '', currentUrl);
    window.history.pushState({ tarhetaPage: 'public' }, '', url);
  }
}
function escapeVCard(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldVCardLine(line) {
  const physicalLines = [];
  const encoder = new TextEncoder();
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > 75) {
      physicalLines.push(current);
      // RFC line folding starts continuations with a space, which counts toward 75 octets.
      current = ` ${character}`;
      bytes = characterBytes + 1;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  physicalLines.push(current);
  return physicalLines.join('\r\n');
}
function makeVCard(profile) {
  const bits = profile.name.trim().split(/\s+/);
  const family = bits.length > 1 ? bits.pop() : '';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCard(family)};${escapeVCard(bits.join(' '))};;;`,
    `FN:${escapeVCard(profile.name)}`,
    ...(profile.organization ? [`ORG:${escapeVCard(profile.organization)}`] : []),
    ...(profile.title ? [`TITLE:${escapeVCard(profile.title)}`] : []),
    ...(normalizePhone(profile.phone) ? [`TEL;TYPE=CELL:${normalizePhone(profile.phone)}`] : []),
    ...(isValidEmail(profile.email) ? [`EMAIL;TYPE=INTERNET:${escapeVCard(profile.email)}`] : []),
    ...(isSafeWebUrl(profile.website) ? [`URL:${escapeVCard(profile.website)}`] : []),
    `URL:${escapeVCard(`https://tarheta.ph/${profile.username}`)}`,
    ...(profile.bio ? [`NOTE:${escapeVCard(profile.bio)}`] : []),
    'END:VCARD',
  ];
  return `${lines.map(foldVCardLine).join('\r\n')}\r\n`;
}
function cardDestination(card) {
  if (card.type === 'phone') {
    const number = normalizePhone(card.value);
    return number ? `tel:${number}` : '';
  }
  if (card.type === 'email') return isValidEmail(card.value) ? `mailto:${card.value}` : '';
  return isSafeWebUrl(card.value) ? card.value : '';
}
const CARD_META = {
  link: { label: 'LINK', icon: Link2 },
  phone: { label: 'PHONE', icon: Phone },
  email: { label: 'EMAIL', icon: Mail },
  photo: { label: 'PHOTO', icon: Sparkles },
  video: { label: 'VIDEO', icon: MoreHorizontal },
  document: { label: 'DOCUMENT', icon: FileText },
  location: { label: 'LOCATION', icon: MapPin },
  payment: { label: 'PAYMENT', icon: QrCode },
  schedule: { label: 'SCHEDULE', icon: CalendarDays },
};

// --- UI components ---
function Brand({ onClick }) {
  return <button className="brand" type="button" onClick={onClick} aria-label="Tarheta home"><span className="brand-mark">t</span><span>tarheta<span className="brand-period">.</span></span></button>;
}

function Button({ children, variant = 'subtle', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

function Toast({ message }) {
  return <div className={`toast ${message ? 'toast-visible' : ''}`} role="status" aria-live="polite">{message}</div>;
}

function ProfileCard({ profile, flip, flipped = false, compact = false }) {
  const appearance = getAppearance(profile);
  const hasBackground = isSafeImageSource(appearance.cardBackgroundImage);
  const cardStyle = {
    '--calling-front-color': appearance.cardFrontColor,
    '--calling-front-background': appearance.cardFrontTransparent ? 'transparent' : appearance.cardFrontColor,
    '--calling-front-text-color': appearance.cardFrontTextColor,
    '--calling-front-name-color': appearance.cardFrontNameColor,
    '--calling-back-color': appearance.cardBackColor,
    '--calling-back-background': appearance.cardBackTransparent ? 'transparent' : appearance.cardBackColor,
    '--calling-back-text-color': appearance.cardBackTextColor,
  };
  const details = [
    ['Mobile', profile.phone],
    ['Email', profile.email],
    ['Web', profile.website],
    ['Based at', profile.organization],
  ].filter(([, value]) => value);
  return (
    <div
      className={`identity-card ${appearance.cardFrontTransparent ? 'card-front-transparent' : ''} ${appearance.cardBackTransparent ? 'card-back-transparent' : ''} ${compact ? 'identity-card-compact' : ''} ${flipped ? 'is-flipped' : ''}`}
      style={cardStyle}
      role="button"
      tabIndex={0}
      onClick={(event) => { if (!event.target.closest('a')) flip(); }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          flip();
        }
      }}
      aria-label={`${flipped ? 'Show front of' : 'Flip'} ${profile.name}'s calling card`}
    >
      <span className="identity-card-inner">
        <span className="identity-card-face identity-card-front">
          {hasBackground && <img className="calling-card-background" src={appearance.cardBackgroundImage} alt="" />}
          <span className="card-overline"><span className="brand-mini">t</span> {appearance.cardFrontLabel} <span className="card-chip" /></span>
          <span className="identity-card-copy"><strong>{profile.name || 'Your name'}</strong><span>{getHeadline(profile) || 'A little about you'}</span></span>
          <span className="identity-card-footer"><span>{[appearance.cardFrontFooter, profile.username?.toUpperCase() || 'YOURNAME'].filter(Boolean).join('/')}</span><span>TURN CARD <ArrowRight size={14} /></span></span>
          <span className="card-decoration">T</span>
        </span>
        <span className="identity-card-face identity-card-back">
          {hasBackground && <img className="calling-card-background" src={appearance.cardBackgroundImage} alt="" />}
          <span className="card-overline">{appearance.cardBackLabel} <span className="back-dot" /></span>
          <span className="contact-lines">
            {details.map(([label, value]) => <span className="contact-line" key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </span>
          {Array.isArray(profile.socialLinks) && profile.socialLinks.length > 0 && <span className="calling-card-socials" aria-label="Social links">{profile.socialLinks.map((social, index) => {
            const SocialIcon = socialIcon(social.label, social.url);
            return <a key={`${social.url}-${index}`} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label} title={social.label} onClick={(event) => event.stopPropagation()}><SocialIcon size={17} aria-hidden="true" /></a>;
          })}</span>}
          <span className="identity-card-footer"><span>{appearance.cardBackFooter}</span><span>TURN BACK <ArrowLeft size={14} /></span></span>
        </span>
      </span>
    </div>
  );
}

function ProfileTile({ card, owner = false, onEdit, onDelete, onMove, onKeyMove, onOpenSchedule, style }) {
  const MetaIcon = CARD_META[card.type]?.icon || Link2;
  const href = cardDestination(card);
  const canOpenSchedule = !owner && card.type === 'schedule' && onOpenSchedule;
  const click = () => {
    if (canOpenSchedule) {
      onOpenSchedule(card);
      return;
    }
    if (!href) return;
    if (href.startsWith('tel:') || href.startsWith('mailto:')) window.location.href = href;
    else window.open(href, '_blank', 'noopener,noreferrer');
  };
  const imageCard = ['photo', 'payment'].includes(card.type) && isSafeImageSource(card.value);
  const schedules = card.type === 'schedule' && Array.isArray(card.schedules) ? card.schedules : [];
  const hasTileBackgroundImage = isSafeImageSource(card.backgroundImage);
  const customBackground = /^#[\da-f]{6}$/i.test(card.backgroundColor || '') || hasTileBackgroundImage || /^#[\da-f]{6}$/i.test(card.textColor || '');
  return (
    <article
      className={`profile-tile tile-${card.type} ${owner ? 'tile-owner' : ''} ${customBackground ? 'tile-custom-background' : ''}`}
      style={{
        ...style,
        '--tile-background-color': /^#[\da-f]{6}$/i.test(card.backgroundColor || '') ? card.backgroundColor : undefined,
        '--tile-text-color': /^#[\da-f]{6}$/i.test(card.textColor || '') ? card.textColor : undefined,
      }}
      data-card-id={card.id}
      tabIndex={owner || (!href && !canOpenSchedule) ? undefined : 0}
      onClick={!owner && (href || canOpenSchedule) ? click : undefined}
      onKeyDown={(event) => {
        if (owner && event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          onKeyMove(card.id, event.key === 'ArrowUp' ? -1 : 1);
        } else if (!owner && (href || canOpenSchedule) && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          click();
        }
      }}
      role={owner ? 'group' : canOpenSchedule ? 'button' : href ? 'link' : undefined}
      aria-label={owner ? `${card.title}, press Alt and an arrow key to reorder` : canOpenSchedule ? `View ${card.title} schedule` : card.title}
    >
      {hasTileBackgroundImage && <img className="tile-background-image" src={card.backgroundImage} alt="" loading="lazy" />}
      {imageCard && <img className="tile-image" src={card.value} alt="" loading="lazy" width="640" height="420" />}
      <span className="tile-type"><MetaIcon size={14} /> {CARD_META[card.type]?.label || 'CARD'} {owner && !card.isPublic && <span className="private-tag">PRIVATE</span>}</span>
      <span className="tile-copy"><strong>{card.title}</strong>{card.type === 'schedule' ? <small>{owner ? `${schedules.length} ${schedules.length === 1 ? 'class' : 'classes'}` : 'Click to view class schedule'}</small> : <small>{card.type === 'phone' || card.type === 'email' ? card.value : card.value.replace(/^https?:\/\//, '')}</small>}</span>
      <span className="tile-bottom"><span className="tile-spark" /><span className="tile-open">{card.type === 'schedule' ? 'SCHEDULE' : card.type === 'video' ? 'PLAY' : card.type === 'phone' ? 'CALL' : 'OPEN'} {card.type !== 'schedule' && <ArrowUpRight size={15} />}</span></span>
      {owner && (
        <>
          <span className="drag-grip" title="Drag to reorder">⠿</span>
          <span className="tile-owner-actions">
            <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(card); }} aria-label={`Edit ${card.title}`}><Pencil size={14} /><span>Edit</span></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onMove(card.id, -1); }} aria-label={`Move ${card.title} up`}><ArrowUp size={14} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onMove(card.id, 1); }} aria-label={`Move ${card.title} down`}><ArrowDown size={14} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(card.id); }} aria-label={`Delete ${card.title}`}><Trash2 size={14} /></button>
          </span>
        </>
      )}
    </article>
  );
}

function CardEditorForm({ cardEditing, onSubmit }) {
  const [type, setType] = useState(cardEditing?.type || 'link');
  const existingSchedules = Array.isArray(cardEditing?.schedules) ? cardEditing.schedules : [];
  const [scheduleCount, setScheduleCount] = useState(Math.max(1, Math.min(15, existingSchedules.length || 1)));

  return (
    <form className="dialog-form" onSubmit={onSubmit}>
      <input type="hidden" name="id" value={cardEditing?.id || ''} readOnly />
      <label className="form-field"><span>Card title</span><input name="title" required maxLength="80" defaultValue={cardEditing?.title || ''} placeholder="My portfolio" /></label>
      <label className="form-field"><span>What kind of card?</span><select name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="link">Link</option><option value="phone">Phone</option><option value="email">Email</option><option value="photo">Photo</option><option value="video">Video</option><option value="document">Document / résumé</option><option value="location">Location / map</option><option value="payment">Payment QR image</option><option value="schedule">Schedule</option></select></label>
      {type === 'schedule' ? (
        <section className="schedule-editor" aria-label="Schedule details">
          <label className="form-field"><span>Number of subjects</span><select name="scheduleCount" value={scheduleCount} onChange={(event) => setScheduleCount(Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index === 0 ? 'subject' : 'subjects'}</option>)}</select></label>
          {Array.from({ length: scheduleCount }, (_, index) => {
            const schedule = existingSchedules[index] || {};
            return <fieldset className="schedule-subject" key={index}><legend>Subject {index + 1}</legend><label className="form-field"><span>Subject name</span><input name={`subjectName-${index}`} required maxLength="100" defaultValue={schedule.subjectName || ''} placeholder="e.g. Introduction to Psychology" /></label><label className="form-field"><span>Day of week</span><select name={`subjectDay-${index}`} required defaultValue={getScheduleWeekday(schedule)}><option value="" disabled>Choose a day</option>{WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label><div className="form-row"><label className="form-field"><span>Start time</span><input name={`subjectStartTime-${index}`} type="time" required defaultValue={schedule.startTime || schedule.time || ''} /></label><label className="form-field"><span>End time</span><input name={`subjectEndTime-${index}`} type="time" required defaultValue={schedule.endTime || ''} /></label></div><label className="form-field"><span>Professor <i>Optional</i></span><input name={`subjectProfessor-${index}`} maxLength="100" defaultValue={schedule.professor || ''} placeholder="Professor name" /></label></fieldset>;
          })}
        </section>
      ) : (
        <>
          {type === 'photo' || type === 'payment' ? (
            <>
              <label className="form-field"><span>Image URL <i>Optional if uploading</i></span><input name="value" type="url" defaultValue={isSafeWebUrl(cardEditing?.value) ? cardEditing.value : ''} placeholder="https://example.com/image.jpg" /></label>
              <label className="form-field"><span>Or choose an image from your device <i>JPG, PNG, or WebP · up to 8 MB</i></span><input name="valueUpload" type="file" accept="image/jpeg,image/png,image/webp" /></label>
              <input type="hidden" name="uploadedValue" value={isImageDataUrl(cardEditing?.value) ? cardEditing.value : ''} readOnly />
              {isImageDataUrl(cardEditing?.value) && <label className="visibility-choice"><input type="checkbox" name="removeUploadedValue" /><span><strong>Remove uploaded image</strong><small>Leave unchecked to keep the current image.</small></span></label>}
            </>
          ) : (
            <label className="form-field"><span>Address or value</span><input name="value" required defaultValue={cardEditing?.value || ''} placeholder="https://example.com" /></label>
          )}
        </>
      )}
      <div className="appearance-color-row"><label className="form-field"><span>Card background</span><input name="backgroundColor" type="color" defaultValue={cardEditing?.backgroundColor || '#25292d'} /></label><label className="form-field"><span>Text color</span><input name="textColor" type="color" defaultValue={cardEditing?.textColor || '#f4f0e6'} /></label></div>
      <label className="form-field"><span>Background image URL <i>Optional</i></span><input name="backgroundImage" type="url" defaultValue={isSafeWebUrl(cardEditing?.backgroundImage) ? cardEditing.backgroundImage : ''} placeholder="https://example.com/image.jpg" /></label>
      <label className="form-field"><span>Or upload a background from your device <i>JPG, PNG, or WebP · up to 8 MB</i></span><input name="backgroundImageUpload" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <input type="hidden" name="uploadedBackgroundImage" value={isImageDataUrl(cardEditing?.backgroundImage) ? cardEditing.backgroundImage : ''} readOnly />
      {isImageDataUrl(cardEditing?.backgroundImage) && <label className="visibility-choice"><input type="checkbox" name="removeUploadedBackgroundImage" /><span><strong>Remove uploaded background</strong><small>Leave unchecked to keep the current image.</small></span></label>}
      <label className="visibility-choice"><input type="checkbox" name="isPublic" defaultChecked={cardEditing ? cardEditing.isPublic : true} /><span><strong>Show on my public page</strong><small>Turn off to keep this just for you.</small></span></label>
      <Button variant="coral" type="submit" className="form-submit">{cardEditing ? 'Save changes' : 'Add card'} <ArrowRight size={16} /></Button>
    </form>
  );
}

function ProfileSettings({ profile, onProfileSave, onSocialSave, onPhotoChange, onRemovePhoto, onPasswordChange }) {
  const [socialLinks, setSocialLinks] = useState(() => Array.isArray(profile.socialLinks) ? profile.socialLinks : []);
  return (
    <div className="profile-settings">
      <div className="collection-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Profile</h2><p>Update each part of your account in its own section.</p></div></div>
      <section className="profile-settings-group">
        <div className="profile-settings-heading"><span className="eyebrow">01 — PHOTO</span><h3>Profile photo</h3><p>Give your Tarheta a familiar face.</p></div>
        <div className="profile-image-editor"><ProfileAvatar profile={profile} className="profile-settings-avatar" /><div><strong>{profile.profileImage ? 'Your photo is ready' : 'No photo added yet'}</strong><small>Choose a JPG, PNG, or WebP image up to 5 MB.</small><div className="profile-image-actions"><label className="button button-outline"><ImagePlus size={15} /> {profile.profileImage ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} /></label>{profile.profileImage && <button className="text-link" type="button" onClick={onRemovePhoto}>Remove photo</button>}</div></div></div>
      </section>
      <form className="profile-settings-group" onSubmit={onProfileSave}>
        <div className="profile-settings-heading"><span className="eyebrow">02 — PERSONAL DETAILS</span><h3>A few details about you</h3><p>These details appear on your Tarheta page and contact card.</p></div>
        <label className="form-field"><span>Name</span><input name="name" required maxLength="100" defaultValue={profile.name} /></label>
        <label className="form-field"><span>Username</span><input name="username" required minLength="3" maxLength="30" pattern="[a-z0-9._]+" defaultValue={profile.username} /></label>
        <div className="form-row"><label className="form-field"><span>Role or title</span><input name="title" maxLength="100" defaultValue={profile.title} /></label><label className="form-field"><span>Organization</span><input name="organization" maxLength="100" defaultValue={profile.organization} /></label></div>
        <label className="form-field"><span>Phone</span><input name="phone" type="tel" defaultValue={profile.phone} /></label>
        <label className="form-field"><span>Public contact email</span><input name="email" type="email" required defaultValue={profile.email} /><small className="profile-email-note">Your sign-in recovery email is the address verified when you created your account.</small></label>
        <label className="form-field"><span>Bio</span><textarea name="bio" maxLength="300" rows="3" defaultValue={profile.bio} /></label>
        <label className="form-field"><span>Website</span><input name="website" defaultValue={profile.website} /></label>
        <Button variant="coral" type="submit" className="form-submit">Save personal details <Check size={16} /></Button>
      </form>
      <form className="profile-settings-group" onSubmit={onSocialSave}>
        <div className="profile-settings-heading"><span className="eyebrow">03 — SOCIAL LINKS</span><h3>Where to find you</h3><p>Add links to your social profiles. They’ll appear on your public page.</p></div>
        <section className="social-link-editor">
          <div className="social-link-heading"><span>{socialLinks.length} of 10 links</span><button className="button button-outline" type="button" disabled={socialLinks.length >= 10} onClick={() => setSocialLinks((links) => [...links, { label: '', url: '' }])}><Plus size={14} /> Add social</button></div>
          <input type="hidden" name="socialCount" value={socialLinks.length} />
          {socialLinks.map((social, index) => <div className="social-link-row" key={index}><label className="form-field"><span>Social name</span><input name={`socialLabel-${index}`} maxLength="30" value={social.label} onChange={(event) => setSocialLinks((links) => links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="e.g. Instagram" /></label><label className="form-field"><span>Profile URL</span><input name={`socialUrl-${index}`} type="url" value={social.url} onChange={(event) => setSocialLinks((links) => links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://instagram.com/you" /></label><button className="icon-button social-link-remove" type="button" onClick={() => setSocialLinks((links) => links.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${social.label || 'social link'}`}><X size={15} /></button></div>)}
        </section>
        <Button variant="coral" type="submit" className="form-submit">Save social links <Check size={16} /></Button>
      </form>
      <form className="profile-settings-group" onSubmit={onPasswordChange}>
        <div className="profile-settings-heading"><span className="eyebrow">04 — SECURITY</span><h3>Change password</h3><p>Your password is securely hashed on the server.</p></div>
        <label className="form-field"><span>Current password</span><input name="currentPassword" type="password" required autoComplete="current-password" /></label>
        <label className="form-field"><span>New password</span><input name="newPassword" type="password" required minLength="8" maxLength="200" autoComplete="new-password" placeholder="At least 8 characters" /></label>
        <label className="form-field"><span>Confirm new password</span><input name="confirmPassword" type="password" required minLength="8" maxLength="200" autoComplete="new-password" /></label>
        <Button variant="coral" type="submit" className="form-submit">Update password <Check size={16} /></Button>
      </form>
    </div>
  );
}

function QRPanel({ url, onCopy }) {
  const canvasRef = useRef(null);
  const download = () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const anchor = document.createElement('a');
    anchor.download = 'tarheta-profile-qr.png';
    anchor.href = canvas.toDataURL('image/png');
    anchor.click();
  };
  return (
    <section className="qr-panel">
      <div className="qr-heading"><span className="qr-icon"><QrCode size={18} /></span><div><strong>Take me with you</strong><small>Scan to open this profile on your phone</small></div></div>
      <div className="qr-code" ref={canvasRef}><QRCodeCanvas value={url} size={128} bgColor="#f4f0e6" fgColor="#171a1f" level="M" includeMargin /></div>
      <div className="qr-actions"><Button variant="paper" onClick={onCopy}><Copy size={15} /> Copy link</Button><button className="icon-button" type="button" onClick={download} aria-label="Download QR code"><Download size={16} /></button></div>
    </section>
  );
}

function Modal({ title, open, onClose, children, className = '', eyebrow = 'TARHETA STUDIO' }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return undefined;
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog ${className}`} onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
      {children}
    </dialog>
  );
}

function ScheduleDialog({ card, onClose }) {
  const schedules = Array.isArray(card?.schedules) ? card.schedules : [];
  return (
    <Modal title={card?.title || 'Class schedule'} eyebrow="WEEKLY CLASS SCHEDULE" open={Boolean(card)} onClose={onClose} className="schedule-dialog">
      <ol className="schedule-dialog-list">
        {schedules.map((schedule, index) => (
          <li key={`${schedule.subjectName}-${index}`}>
            <strong>{schedule.subjectName}</strong>
            <span>{getScheduleWeekday(schedule) || schedule.date} · {formatScheduleTime(schedule.startTime || schedule.time)}{schedule.endTime ? ` - ${formatScheduleTime(schedule.endTime)}` : ''}</span>
            {schedule.professor && <small>{schedule.professor}</small>}
          </li>
        ))}
      </ol>
    </Modal>
  );
}

function App() {
  const [page, setPage] = useState('landing');
  const [section, setSection] = useState('card');
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState('');
  const [username, setUsername] = useState('');
  const [authStep, setAuthStep] = useState('details');
  const [authEmail, setAuthEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [cardDialog, setCardDialog] = useState(false);
  const [contactDialog, setContactDialog] = useState('');
  const [scheduleDialog, setScheduleDialog] = useState(null);
  const [cardEditing, setCardEditing] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const toastTimer = useRef(null);
  const ownerCardsRef = useRef(null);
  const lastPointerType = useRef('mouse');
  const routerStarted = useRef(false);

  const showToast = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);
  const saveProfile = useCallback(async (next) => {
    try {
      const result = await apiRequest('/api/profile', { method: 'PUT', body: next });
      setProfile(result.profile);
      return true;
    } catch (error) {
      showToast(error.message || 'Could not save your profile. Please try again.');
      return false;
    }
  }, [showToast]);
  const openPublic = useCallback(async (target, { addHistory = false } = {}) => {
    const user = target || profile?.username;
    if (!user) return;
    try {
      const found = user.toLowerCase() === 'demo'
        ? structuredClone(DEMO_PROFILE)
        : (await apiRequest(`/api/profiles/${encodeURIComponent(user)}`)).profile;
      setProfile(found);
      setPage('public');
      setFlipped(false);
      changeAddress(user, { replace: !addHistory, state: { tarhetaPage: page } });
    } catch (error) {
      if (error.status === 404) {
        setProfile(null);
        setPage('not-found');
        changeAddress(user);
      } else {
        console.error('Unable to load the public profile.', error);
        showToast(error.message || 'Could not load this profile. Please try again.');
      }
    }
  }, [page, profile?.username, showToast]);

  useEffect(() => {
    const rememberPointer = (event) => { lastPointerType.current = event.pointerType; };
    window.addEventListener('pointerdown', rememberPointer, { passive: true });
    return () => window.removeEventListener('pointerdown', rememberPointer);
  }, []);
  useEffect(() => {
    if (routerStarted.current) return;
    routerStarted.current = true;
    if (window.location.pathname === '/admin/feedback') {
      setPage('admin-feedback');
      return;
    }
    const routedUser = new URLSearchParams(window.location.search).get('u')
      || window.location.hash.match(/^#\/(.+)$/)?.[1];
    if (routedUser) {
      let decodedUser = routedUser;
      try { decodedUser = decodeURIComponent(routedUser); } catch {}
      openPublic(decodedUser);
      return;
    }
    apiRequest('/api/auth/session')
      .then(({ profile: signedProfile }) => {
        setProfile(signedProfile);
        setPage('owner');
      })
      .catch((error) => {
        if (error.status !== 401) {
          console.error('Unable to restore the signed-in session.', error);
          showToast(error.message || 'Could not connect to your account.');
        }
      });
  }, []); // Router initialization intentionally runs once.

  useEffect(() => {
    const restoreRoute = async (event) => {
      const routedUser = new URLSearchParams(window.location.search).get('u')
        || window.location.hash.match(/^#\/(.+)$/)?.[1];
      if (routedUser) {
        let username = routedUser;
        try { username = decodeURIComponent(routedUser); } catch {}
        await openPublic(username);
        return;
      }
      if (event.state?.tarhetaPage === 'owner') {
        try {
          const { profile: signedProfile } = await apiRequest('/api/auth/session');
          setProfile(signedProfile);
          setPage('owner');
          return;
        } catch (error) {
          if (error.status !== 401) console.error('Unable to restore the signed-in session.', error);
        }
      }
      setPage('landing');
    };
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, [openPublic]);

  useEffect(() => {
    const isPublic = page === 'public' && profile;
    const title = isPublic ? `${profile.name} — Tarheta` : 'Tarheta — a little more personal';
    const description = isPublic
      ? (profile.bio || `${getHeadline(profile) || 'A personal calling card'} — connect with ${profile.name} on Tarheta.`)
      : 'One thoughtful link for your calling card, contact details, and everything you want to share.';
    document.title = title;
    const updateMeta = (selector, value) => {
      const tag = document.querySelector(selector);
      if (tag) tag.setAttribute('content', value);
    };
    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:url"]', window.location.href);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);
  }, [page, profile]);

  useEffect(() => {
    const keyHandler = (event) => {
      if (event.key === 'Escape') setContactDialog('');
      const typing = event.target.matches?.('input,textarea,select,[contenteditable="true"]');
      if (typing || page !== 'owner' || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === 'n') { setSection('cards'); setCardEditing(null); setCardDialog(true); }
      if (event.key.toLowerCase() === 'e') setSection('profile');
      if (event.key.toLowerCase() === 'c') copyProfile();
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [page, profile]);

  const profileHref = useMemo(() => profile?.username ? profileUrl(profile.username) : '', [profile?.username, page]);
  const saveContact = () => {
    if (!profile) return;
    const blob = new Blob([makeVCard(profile)], { type: 'text/vcard' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${profile.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || profile.username}.vcf`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    showToast('Contact file downloaded. Open it to add it to your contacts.');
  };
  const copyText = async (text, success = 'Copied to clipboard.') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(success);
    } catch (error) {
      console.error('Clipboard unavailable.', error);
      showToast('Clipboard unavailable. Copy the URL from your browser.');
    }
  };
  const copyProfile = () => profile && copyText(profileHref, 'Profile link copied.');
  const shareProfile = async () => {
    if (!profile) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${profile.name} · Tarheta`, text: `A little more about ${profile.name}.`, url: profileHref });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.info('Native share unavailable; using copy fallback.', error);
      }
    }
    copyProfile();
  };
  const leaveOwner = async () => {
    try {
      await apiRequest('/api/auth/session', { method: 'DELETE' });
      setProfile(null);
      setPage('landing');
      changeAddress();
      document.title = 'Tarheta — a little more personal';
    } catch (error) {
      console.error('Unable to sign out.', error);
      showToast(error.message || 'Could not sign out. Please try again.');
    }
  };
  const profileInitial = () => {
    setProfile(EMPTY_PROFILE);
    setAuthStep('details');
    setAuthEmail('');
    setAuthMessage('');
    setPage('register');
  };
  const changeProfilePhoto = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showToast('Choose a JPG, PNG, or WebP image.');
    if (file.size > 5 * 1024 * 1024) return showToast('Choose an image smaller than 5 MB.');
    try {
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'));
        reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const loadedImage = new Image();
        loadedImage.onload = () => resolve(loadedImage);
        loadedImage.onerror = () => reject(new Error('The selected file is not a valid image.'));
        loadedImage.src = source;
      });
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the selected image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (await saveProfile({ ...profile, profileImage: canvas.toDataURL('image/jpeg', 0.82) })) showToast('Profile photo updated.');
    } catch (error) {
      console.error('Unable to update the profile photo.', error);
      showToast('Could not update the profile photo. Please try another image.');
    }
  };
  const removeProfilePhoto = async () => {
    if (await saveProfile({ ...profile, profileImage: '' })) showToast('Profile photo removed.');
  };
  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const currentPassword = String(data.currentPassword || '');
    const newPassword = String(data.newPassword || '');
    if (newPassword.length < 8) return showToast('Choose a password with at least 8 characters.');
    if (newPassword !== String(data.confirmPassword || '')) return showToast('The new passwords do not match.');
    try {
      await apiRequest('/api/auth/password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      form.reset();
      showToast('Password updated.');
    } catch (error) {
      showToast(error.message || 'Could not update your password. Please try again.');
    }
  }
  const updateCards = async (cards) => saveProfile({ ...profile, cards });
  const removeCard = async (id) => {
    if (await updateCards(profile.cards.filter((card) => card.id !== id))) showToast('Card removed.');
  };
  const moveCard = async (id, direction) => {
    const cards = [...(profile.cards || [])];
    const index = cards.findIndex((card) => card.id === id);
    const nextIndex = Math.max(0, Math.min(cards.length - 1, index + direction));
    if (index < 0 || nextIndex === index) return;
    [cards[index], cards[nextIndex]] = [cards[nextIndex], cards[index]];
    if (await updateCards(cards)) requestAnimationFrame(() => ownerCardsRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.focus());
  };
  const onDragStart = (event, id) => {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = async (event, targetId) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const cards = [...(profile.cards || [])];
    const from = cards.findIndex((card) => card.id === id);
    const to = cards.findIndex((card) => card.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [card] = cards.splice(from, 1);
    cards.splice(to, 0, card);
    await updateCards(cards);
  };

  async function submitProfile(event, mode) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const name = String(data.name || '').trim();
    const normalizedUsername = String(data.username || '').trim().toLowerCase();
    const email = String(data.email || '').trim();
    const phone = data.phone ? normalizePhone(String(data.phone)) : '';
    if (!name) return showToast('Enter your name to continue.');
    if (!/^[a-z0-9._]{3,30}$/.test(normalizedUsername) || RESERVED.has(normalizedUsername)) return showToast('Choose a valid, non-reserved username.');
    if (mode === 'register' && String(data.password || '').length < 8) return showToast('Choose a password with at least 8 characters.');
    if (!isValidEmail(email)) return showToast('Enter a valid email address.');
    if (data.phone && !phone) return showToast('Enter a Philippine mobile number, such as +639171234567.');
    let website = String(data.website || '').trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (website && !isSafeWebUrl(website)) return showToast('Use a valid http or https website address.');
    const next = {
      ...(mode === 'edit' ? profile : { cards: [], views: 0 }),
      name, username: normalizedUsername, title: String(data.title || '').trim(),
      organization: String(data.organization || '').trim(), phone, email,
      bio: String(data.bio || '').trim(), website,
      socialLinks: Array.isArray(profile?.socialLinks) ? profile.socialLinks : [],
    };
    if (mode === 'edit') {
      if (!await saveProfile(next)) return;
      showToast('Your profile looks lovely. Changes saved.');
    } else {
      try {
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: { profile: next, password: String(data.password || '') },
        });
        setAuthEmail(email.toLowerCase());
        setAuthStep('verify-registration');
        setAuthMessage('');
      } catch (error) {
        showToast(error.message || 'Could not send your verification code. Please try again.');
      }
    }
  }
  async function submitSocialLinks(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const socialCount = Number(data.socialCount);
    if (!Number.isInteger(socialCount) || socialCount < 0 || socialCount > 10) return showToast('Add up to 10 social links.');
    const socialLinks = Array.from({ length: socialCount }, (_, index) => ({
      label: String(data[`socialLabel-${index}`] || '').trim(),
      url: String(data[`socialUrl-${index}`] || '').trim(),
    })).filter((social) => social.label || social.url);
    if (socialLinks.some((social) => !social.label || !isSafeWebUrl(social.url))) return showToast('Each social link needs a name and a valid http or https URL.');
    if (await saveProfile({ ...profile, socialLinks })) showToast('Your social links have been saved.');
  }
  async function submitCard(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const type = String(data.type);
    let value = String(data.value || '').trim();
    let backgroundImage = String(data.backgroundImage || '').trim();
    const backgroundColor = String(data.backgroundColor || '');
    const textColor = String(data.textColor || '');
    const valueFile = data.valueUpload;
    const backgroundFile = data.backgroundImageUpload;
    const hasValueFile = valueFile instanceof File && valueFile.size > 0;
    const hasBackgroundFile = backgroundFile instanceof File && backgroundFile.size > 0;
    const storedValueImage = String(data.uploadedValue || '');
    const storedBackgroundImage = String(data.uploadedBackgroundImage || '');
    try {
      if (['photo', 'payment'].includes(type)) {
        if (hasValueFile) value = await optimizeUploadedImage(valueFile);
        else if (!value && data.removeUploadedValue !== 'on' && isImageDataUrl(storedValueImage)) value = storedValueImage;
      }
      if (hasBackgroundFile) backgroundImage = await optimizeUploadedImage(backgroundFile);
      else if (!backgroundImage && data.removeUploadedBackgroundImage !== 'on' && isImageDataUrl(storedBackgroundImage)) backgroundImage = storedBackgroundImage;
    } catch (error) {
      console.error('Unable to prepare a card image.', error);
      return showToast(error.message || 'Could not prepare the selected image.');
    }
    if (type === 'phone' && !normalizePhone(value)) return showToast('Enter a valid Philippine mobile number.');
    if (type === 'email' && !isValidEmail(value)) return showToast('Enter a valid email address.');
    if (type !== 'schedule' && !['phone', 'email'].includes(type) && !(type === 'photo' || type === 'payment' ? isSafeImageSource(value) : isSafeWebUrl(value))) {
      return showToast(type === 'photo' || type === 'payment' ? 'Add a valid image URL or choose an image from your device.' : 'Use a complete http:// or https:// URL.');
    }
    if (backgroundImage && !isSafeImageSource(backgroundImage)) return showToast('Use a valid http or https URL or choose an image from your device.');
    const scheduleCount = Number(data.scheduleCount);
    const schedules = type === 'schedule'
      ? Array.from({ length: scheduleCount }, (_, index) => ({
        subjectName: String(data[`subjectName-${index}`] || '').trim(),
        day: String(data[`subjectDay-${index}`] || ''),
        startTime: String(data[`subjectStartTime-${index}`] || ''),
        endTime: String(data[`subjectEndTime-${index}`] || ''),
        professor: String(data[`subjectProfessor-${index}`] || '').trim(),
      }))
      : undefined;
    if (type === 'schedule' && (!Number.isInteger(scheduleCount) || scheduleCount < 1 || scheduleCount > 15 || schedules.some((schedule) => !schedule.subjectName || !WEEKDAYS.includes(schedule.day) || !isValidScheduleTimeRange(schedule.startTime, schedule.endTime)))) {
      return showToast('Each subject needs a name, weekday, and valid start and end times.');
    }
    const id = data.id || (window.crypto?.randomUUID?.() || `card-${Date.now()}`);
    const nextCard = { id, title: String(data.title || '').trim(), type, value: type === 'schedule' ? '' : value, ...(schedules ? { schedules } : {}), isPublic: data.isPublic === 'on', backgroundColor, textColor, backgroundImage };
    const cards = cardEditing
      ? profile.cards.map((card) => card.id === cardEditing.id ? nextCard : card)
      : [...(profile.cards || []), nextCard];
    if (await updateCards(cards)) {
      setCardDialog(false);
      setCardEditing(null);
      showToast(cardEditing ? 'Card updated.' : 'Card added.');
    }
  }
  function beginCardEdit(card = null) {
    setCardEditing(card);
    setCardDialog(true);
  }
  async function saveAppearance(appearance) {
    if (appearance.cardBackgroundImage && !isSafeImageSource(appearance.cardBackgroundImage)) {
      showToast('Use a valid http or https URL or choose an image from your device.');
      return;
    }
    const cardCopy = ['cardFrontLabel', 'cardFrontFooter', 'cardBackLabel', 'cardBackFooter'];
    const nextAppearance = {
      ...appearance,
      cardBackgroundImage: String(appearance.cardBackgroundImage || '').trim(),
      ...Object.fromEntries(cardCopy.map((key) => [key, String(appearance[key] || '').trim()])),
    };
    if (await saveProfile({ ...profile, appearance: nextAppearance })) showToast('Your appearance has been saved.');
  }

  const userFeedback = username.trim()
    ? !/^[a-z0-9._]{3,30}$/.test(username.trim().toLowerCase()) ? 'Use 3–30 lowercase letters, numbers, dots, and underscores.'
      : RESERVED.has(username.trim().toLowerCase()) ? 'This username is reserved.'
        : 'Looks good — availability is checked when you save.'
    : 'Use 3–30 lowercase letters, numbers, dots, and underscores.';

  const routeTo = (next) => {
    if (next === 'login' || next === 'register') {
      setAuthStep('details');
      setAuthEmail('');
      setAuthMessage('');
    }
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const PublicProfile = () => {
    const phone = normalizePhone(profile.phone);
    const desktopCall = (event) => {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && lastPointerType.current !== 'touch' && event.detail > 0) {
        event.preventDefault();
        setContactDialog('Call this number');
      }
    };
    const desktopSms = (event) => {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && lastPointerType.current !== 'touch' && event.detail > 0) {
        event.preventDefault();
        setContactDialog('Message this number');
      }
    };
    return (
      <main className="public-shell" style={appearanceStyle(profile)}>
        <aside className="public-profile-panel">
          <div className="public-panel-top"><Brand onClick={() => { changeAddress(); routeTo('landing'); }} /><span className="availability"><span /> OPEN TO GOOD CONVERSATIONS</span></div>
          <div className="profile-portrait-row"><ProfileAvatar profile={profile} className="avatar-large" /><span className="portrait-stamp">TARHETA<br />MEMBER</span></div>
          <div className="public-name-block">
            <span className="eyebrow">A LITTLE INTRODUCTION</span>
            <h1>{profile.name}<span className="name-period">.</span></h1>
            <p className="public-headline">{getHeadline(profile)}</p>
            <p className="profile-url"><Link2 size={14} /> tarheta.ph/{profile.username}</p>
          </div>
          <p className="public-bio">{profile.bio || 'A little more about me, and the best ways to get in touch.'}</p>
          <div className="public-actions">
            <div className="primary-actions">
              {phone && <a className="button button-coral button-prominent" href={`tel:${phone}`} onClick={desktopCall}><Phone size={17} /> Call me <ArrowUpRight size={15} /></a>}
              <button className="button button-light button-prominent" type="button" onClick={saveContact}><UserRound size={17} /> Save contact</button>
            </div>
            <div className="secondary-actions">
              {phone && <a className="button button-outline" href={`sms:${phone}`} onClick={desktopSms}><MessageCircle size={16} /> Message</a>}
              {isValidEmail(profile.email) && <a className="button button-outline" href={`mailto:${profile.email}`}><Mail size={16} /> Email</a>}
              {(Array.isArray(profile.socialLinks) ? profile.socialLinks : []).map((social, index) => <a className="button button-outline" key={`${social.url}-${index}`} href={social.url} target="_blank" rel="noopener noreferrer"><Globe2 size={15} /> {social.label} <ArrowUpRight size={13} /></a>)}
              <button className="button button-outline" type="button" onClick={shareProfile}><Share2 size={16} /> Share</button>
            </div>
          </div>
          <QRPanel url={profileHref} onCopy={copyProfile} />
          <div className="panel-footer"><span>MADE TO BE SHARED</span><span>© TARHETA</span></div>
        </aside>
        <section className="public-content">
          <div className="content-topline"><button className="public-back-button" type="button" onClick={() => { changeAddress(); routeTo('landing'); }}>← Back to Tarheta</button><span>001 — {profile.username.toUpperCase()}</span></div>
          <div className="card-display-heading"><div><span className="eyebrow">A DIGITAL CALLING CARD</span><h2>Meet me, <em>properly.</em></h2></div><span className="flip-note"><span className="flip-glyph">↻</span> TAP TO TURN</span></div>
          <ProfileCard profile={profile} flipped={flipped} flip={() => setFlipped((current) => !current)} />
          <div className="section-title-row"><div><span className="eyebrow">A FEW MORE THINGS</span><h2>Elsewhere, online.</h2></div><span className="count-pill">{profile.cards.filter((card) => card.isPublic).length.toString().padStart(2, '0')} LINKS</span></div>
          <div className="public-card-grid">
            {profile.cards.filter((card) => card.isPublic).map((card, index) => <ProfileTile key={card.id} card={card} onOpenSchedule={setScheduleDialog} style={{ '--tile-index': index }} />)}
            {profile.website && <a className="website-feature" href={profile.website} target="_blank" rel="noreferrer"><span className="website-icon"><Globe2 size={20} /></span><span><small>MY CORNER OF THE INTERNET</small><strong>Visit my website</strong></span><ArrowUpRight size={18} /></a>}
          </div>
          <footer className="public-footer"><Brand onClick={() => { changeAddress(); routeTo('landing'); }} /><span>A PERSONAL PAGE BY TARHETA</span><button type="button" onClick={shareProfile}><Share2 size={15} /> PASS IT ON</button></footer>
        </section>
        <div className="mobile-contact-bar">
          {phone && <a className="button button-coral" href={`tel:${phone}`}><Phone size={17} /> Call</a>}
          <button className="button button-light" type="button" onClick={saveContact}><UserRound size={17} /> Save contact</button>
        </div>
        <Modal title={contactDialog} open={Boolean(contactDialog)} onClose={() => setContactDialog('')} className="contact-dialog">
          <p className="contact-number">{profile.phone}</p>
          <p className="dialog-copy">If your computer doesn't have a calling app, copy this number or scan the profile code with your phone.</p>
          <QRCodeCanvas value={profileHref} size={132} bgColor="#f4f0e6" fgColor="#171a1f" level="M" includeMargin />
          <div className="dialog-actions"><Button variant="outline" onClick={() => copyText(profile.phone, 'Phone number copied.')}><Copy size={15} /> Copy number</Button><Button variant="coral" onClick={() => setContactDialog('')}>Done</Button></div>
        </Modal>
        <ScheduleDialog card={scheduleDialog} onClose={() => setScheduleDialog(null)} />
      </main>
    );
  };

  if (page === 'admin-feedback') return <AdminFeedbackPage />;
  if (page === 'public' && profile) return <><PublicProfile /><FeedbackWidget profileUsername={profile.username} onToast={showToast} /><Toast message={toast} /></>;
  if (page === 'not-found') return <><div className="not-found-page"><Brand onClick={() => { changeAddress(); routeTo('landing'); }} /><span className="eyebrow">404 · LOST IN THE POST</span><h1>Hmm, nobody<br /><em>by that name.</em></h1><p>We couldn’t find that Tarheta page. Maybe a little typo?</p><Button variant="coral" onClick={profileInitial}>Make your own profile <ArrowRight size={16} /></Button></div><Toast message={toast} /></>;

  if (page === 'landing') return (
    <>
      <main className="landing">
        <header className="site-header"><Brand onClick={() => routeTo('landing')} /><nav className="header-links"><a href="#story">The idea</a><a href="#features">What you can share</a></nav><div className="header-actions"><button className="header-login" type="button" onClick={() => routeTo('login')}>Log in</button><Button variant="coral" onClick={profileInitial}>Create your page <ArrowRight size={15} /></Button></div></header>
        <section className="landing-hero">
          <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-mark" /> A MORE THOUGHTFUL WAY TO CONNECT</span><h1>Your whole<br />story, <em>one link.</em></h1><p>A little calling card for the internet. Your details, your work, your favorite corners — gathered in one lovely place.</p><div className="hero-buttons"><Button variant="coral" onClick={profileInitial}>Make your Tarheta <ArrowRight size={16} /></Button><button className="text-link" type="button" onClick={() => openPublic('demo', { addHistory: true })}>Take a little look <ArrowUpRight size={15} /></button></div><div className="social-proof"><div className="proof-avatars"><span>J</span><span>M</span><span>A</span></div><span>For the people you’re glad you met.</span></div></div>
          <div className="hero-art" aria-label="A layered collection of Tarheta profile cards">
            <div className="art-note">A GOOD INTRO<br />GOES A LONG WAY <span>✳</span></div>
            <div className="art-card art-card-back"><span>01 / A THOUGHTFUL LINK</span><div className="art-circle" /><strong>Make room<br />for hello.</strong><small>tarheta.ph/you</small></div>
            <div className="art-card art-card-mid"><span>YOUR ONLINE HOME</span><strong>Work<br />worth sharing.</strong><div className="art-pills"><i /> <i /> <i /></div></div>
            <div className="art-card art-card-front"><div className="art-card-top"><span className="brand-mark">t</span><span>PERSONAL ID · 2025</span><span>✳</span></div><div className="art-avatar">JD</div><div><small>GOOD TO MEET YOU</small><strong>Juan Dela Cruz</strong><span>Designer · Manila</span></div><div className="art-card-bottom"><span>tarheta.ph/juandelacruz</span><ArrowUpRight size={17} /></div></div>
            <div className="art-caption"><span>01</span><span>YOUR DIGITAL CALLING CARD</span><span>↗</span></div>
          </div>
        </section>
        <section className="manifesto" id="story"><span className="eyebrow">LESS SCROLLING. MORE CONNECTING.</span><p>Not another feed to keep up with.<br />Just a <em>good-looking little home</em> for all the ways to find you.</p><span className="manifesto-mark">✳</span></section>
        <section className="feature-section" id="features"><div className="section-title-row"><div><span className="eyebrow">A FEW THINGS IT DOES</span><h2>Small page.<br /><em>Big introduction.</em></h2></div><p>Everything useful, nothing noisy. Your page is yours to shape and easy for someone else to use.</p></div><div className="feature-grid"><article><span className="feature-number">01 / YOUR NAME, YOUR LINK</span><div className="feature-icon feature-icon-coral"><Link2 size={20} /></div><h3>One link to remember</h3><p>Your own corner of Tarheta. Easy to send, save, print, or scan.</p></article><article><span className="feature-number">02 / KEEP IT PERSONAL</span><div className="feature-icon feature-icon-green"><UserRound size={20} /></div><h3>A card that feels like you</h3><p>Share your contact details with a little more warmth than an email signature.</p></article><article><span className="feature-number">03 / YOUR OTHER WORLDS</span><div className="feature-icon feature-icon-gold"><Sparkles size={20} /></div><h3>Everything else, in reach</h3><p>Work, places, playlists, writing — make a neat little map of what matters to you.</p></article></div></section>
        <section className="closing-cta"><div><span className="eyebrow">YOUR INTRODUCTION IS WAITING</span><h2>Let’s make your<br /><em>next hello</em> a good one.</h2></div><Button variant="light" onClick={profileInitial}>Start your free page <ArrowRight size={16} /></Button><span className="closing-sun">✳</span></section>
        <footer className="site-footer"><Brand onClick={() => routeTo('landing')} /><span>MADE FOR GOOD CONNECTIONS</span><span>© TARHETA</span></footer>
      </main><FeedbackWidget onToast={showToast} /><Toast message={toast} />
    </>
  );

  if (page === 'register' || page === 'login') {
    const registering = page === 'register';
    const verifyingRegistration = registering && authStep === 'verify-registration';
    const requestingReset = !registering && authStep === 'forgot-email';
    const resettingPassword = !registering && authStep === 'forgot-reset';
    const onLogin = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const user = String(formData.get('username') || '').trim().toLowerCase();
      const password = String(formData.get('password') || '');
      try {
        const { profile: signedProfile } = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { username: user, password },
        });
        setProfile(signedProfile);
        setPage('owner');
        changeAddress();
        showToast(`Welcome back, ${signedProfile.name}.`);
      } catch (error) {
        showToast(error.message || 'Could not sign in. Please try again.');
      }
    };
    const onVerifyRegistration = async (event) => {
      event.preventDefault();
      const code = String(new FormData(event.currentTarget).get('code') || '').trim();
      try {
        const result = await apiRequest('/api/auth/register/verify', {
          method: 'POST',
          body: { email: authEmail, code },
        });
        setUsername(result.profile.username);
        setAuthStep('details');
        setAuthMessage(result.message || 'Your email is verified. Log in to continue.');
        setPage('login');
      } catch (error) {
        showToast(error.message || 'Could not verify that code. Please try again.');
      }
    };
    const onRequestReset = async (event) => {
      event.preventDefault();
      const email = String(new FormData(event.currentTarget).get('email') || '').trim().toLowerCase();
      try {
        const result = await apiRequest('/api/auth/password/reset-request', {
          method: 'POST',
          body: { email },
        });
        setAuthEmail(email);
        setAuthStep('forgot-reset');
        setAuthMessage(result.message);
      } catch (error) {
        showToast(error.message || 'Could not request a reset code. Please try again.');
      }
    };
    const onResetPassword = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const result = await apiRequest('/api/auth/password/reset', {
          method: 'POST',
          body: { email: authEmail, code: data.code, newPassword: data.newPassword },
        });
        setAuthStep('details');
        setAuthMessage(result.message || 'Password changed. Log in with your new password.');
      } catch (error) {
        showToast(error.message || 'Could not reset your password. Please try again.');
      }
    };
    const onResendCode = async (purpose) => {
      try {
        const result = await apiRequest('/api/auth/code/resend', {
          method: 'POST',
          body: { email: authEmail, purpose },
        });
        setAuthMessage(result.message);
      } catch (error) {
        showToast(error.message || 'Could not send another code yet.');
      }
    };
    const authEmailNote = (title, copy) => (
      <div className="auth-email-note"><Mail size={18} /><span><strong>{title}</strong><small>{copy}</small></span></div>
    );
    const switchAuthPage = () => {
      setAuthStep('details');
      setAuthEmail('');
      setAuthMessage('');
      routeTo(registering ? 'login' : 'register');
    };
    const authTitle = verifyingRegistration ? 'Check your inbox'
      : requestingReset ? 'Reset your password'
        : resettingPassword ? 'Choose a new password'
          : registering ? 'Create your Tarheta' : 'Log in to your page';
    const authIntro = verifyingRegistration
      ? `Enter the 6-digit verification code sent to ${authEmail}. It expires in 5 minutes.`
      : requestingReset
        ? 'Enter the email address you used for your Tarheta account.'
        : resettingPassword
          ? `Enter the reset code sent to ${authEmail} and choose a new password. The code expires in 5 minutes.`
          : registering
            ? 'A few details now. Your lovely page in a minute.'
            : 'Sign in with your username and password.';
    const authSubmit = verifyingRegistration ? onVerifyRegistration
      : requestingReset ? onRequestReset
        : resettingPassword ? onResetPassword
          : registering ? (event) => submitProfile(event, 'register') : onLogin;
    return (
      <>
        <main className="auth-page">
          <header className="site-header auth-header"><Brand onClick={() => routeTo('landing')} /><span className="auth-header-note">A SMALL PAGE WITH A LOT OF HEART</span><button className="header-login" type="button" onClick={switchAuthPage}>{registering ? 'I have a page' : 'New to Tarheta?'}</button></header>
          <div className="auth-layout">
            <aside className="auth-story"><span className="eyebrow">{registering ? 'START WITH A NAME' : 'GOOD TO HAVE YOU BACK'}</span><h1>{registering ? <>Make a little<br />room for <em>hello.</em></> : <>Your little<br />corner is <em>here.</em></>}</h1><p>{registering ? 'A personal page for the things you want people to remember about you.' : 'Pick up where you left off. Your Tarheta profile is ready.'}</p><div className="auth-card-preview"><span className="card-overline">TARHETA · PERSONAL ID</span><strong>{registering ? 'A name people remember.' : 'Your name, your story.'}</strong><span>tarheta.ph/{username || 'yourname'}</span><div className="preview-stamp">MADE TO BE SHARED</div></div></aside>
            <section className="auth-card"><button className="back-link" type="button" onClick={() => routeTo('landing')}><ArrowLeft size={15} /> Back to home</button><span className="eyebrow">{verifyingRegistration || requestingReset || resettingPassword ? 'A QUICK, SECURE CHECK' : registering ? 'LET’S GET YOU STARTED' : 'WELCOME BACK'}</span><h2>{authTitle}</h2><p className="auth-intro">{authIntro}</p>
              {authMessage && <div className="auth-message" role="status"><ShieldCheck size={16} /><span>{authMessage}</span></div>}
              {verifyingRegistration && authEmailNote('Sent to your inbox', 'Check spam or junk if it doesn’t arrive.')}
              {resettingPassword && authEmailNote('Reset code sent', 'Check spam or junk if it doesn’t arrive.')}
              <form key={`${page}-${authStep}`} onSubmit={authSubmit}>
                {verifyingRegistration ? <>
                  <label className="form-field"><span>Verification code</span><input name="code" required inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoComplete="one-time-code" placeholder="6-digit code" /></label>
                  <Button variant="coral" type="submit" className="form-submit">Verify email and continue <ArrowRight size={16} /></Button>
                  <button className="text-link auth-back-action" type="button" onClick={() => onResendCode('registration')}>Resend verification code</button>
                  <button className="text-link auth-back-action" type="button" onClick={() => { setAuthStep('details'); setAuthEmail(''); }}>Use a different email or edit details</button>
                </> : requestingReset ? <>
                  <label className="form-field"><span>Account email</span><input name="email" type="email" required maxLength="254" defaultValue={authEmail} autoComplete="email" placeholder="you@example.com" /></label>
                  <Button variant="coral" type="submit" className="form-submit">Send reset code <ArrowRight size={16} /></Button>
                  <button className="text-link auth-back-action" type="button" onClick={() => { setAuthStep('details'); setAuthMessage(''); }}>Back to login</button>
                </> : resettingPassword ? <>
                  <label className="form-field"><span>6-digit reset code</span><input name="code" required inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoComplete="one-time-code" placeholder="6-digit code" /></label>
                  <label className="form-field"><span>New password</span><input name="newPassword" type="password" required minLength="8" maxLength="200" autoComplete="new-password" placeholder="At least 8 characters" /></label>
                  <Button variant="coral" type="submit" className="form-submit">Change password <ArrowRight size={16} /></Button>
                  <button className="text-link auth-back-action" type="button" onClick={() => onResendCode('password_reset')}>Resend reset code</button>
                  <button className="text-link auth-back-action" type="button" onClick={() => setAuthStep('forgot-email')}>Use a different email</button>
                </> : <>
                  {registering && <label className="form-field"><span>Your name <i>Required</i></span><input name="name" required autoComplete="name" placeholder="e.g. Juan Dela Cruz" /></label>}
                  <label className="form-field"><span>Username <i>Required</i></span><div className="username-field"><span>tarheta.ph/</span><input name="username" required minLength="3" maxLength="30" pattern="[a-z0-9._]+" placeholder="yourname" value={registering ? username : undefined} defaultValue={!registering ? username : undefined} onChange={registering ? (event) => setUsername(event.target.value.toLowerCase()) : undefined} /></div>{registering && <small className={userFeedback.startsWith('Looks good') ? 'field-feedback good' : 'field-feedback'}>{userFeedback}</small>}</label>
                  <label className="form-field"><span>Password <i>Required</i></span><input name="password" type="password" required minLength="8" maxLength="200" autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? 'At least 8 characters' : 'Your password'} /></label>
                  {registering && <>
                    <div className="form-row"><label className="form-field"><span>Title or role</span><input name="title" placeholder="Designer" /></label><label className="form-field"><span>Organization</span><input name="organization" placeholder="Studio or school" /></label></div>
                    <label className="form-field"><span>Phone <i>Optional</i></span><input name="phone" type="tel" placeholder="+639171234567" /></label>
                    <label className="form-field"><span>Email <i>Required</i></span><input name="email" type="email" required placeholder="you@example.com" /></label>
                    <label className="form-field"><span>A little about you</span><textarea name="bio" maxLength="300" rows="3" placeholder="What would you like people to know?" /></label>
                    <label className="form-field"><span>Your website <i>Optional</i></span><input name="website" placeholder="https://yourwebsite.com" /></label>
                  </>}
                  {!registering && <button className="text-link auth-forgot-link" type="button" onClick={() => { setAuthEmail(''); setAuthMessage(''); setAuthStep('forgot-email'); }}>Forgot your password?</button>}
                  <Button variant="coral" type="submit" className="form-submit">{registering ? 'Send verification code' : 'Open my page'} <ArrowRight size={16} /></Button>
                </>}
              </form>
              {(!verifyingRegistration && !requestingReset && !resettingPassword) && <p className="auth-switch">{registering ? 'Already made a page?' : 'First time here?'} <button type="button" onClick={switchAuthPage}>{registering ? 'Log in' : 'Make your page'}</button></p>}
              <p className="prototype-note"><ShieldCheck size={14} /> Your profile is saved securely to your account.</p>
            </section>
          </div>
        </main><Toast message={toast} />
      </>
    );
  }

  if (page === 'owner' && profile) {
    const visibleCards = profile.cards || [];
    return (
      <>
        <main className="owner-app" style={appearanceStyle(profile)}>
          <aside className="owner-sidebar"><Brand onClick={() => { changeAddress(); routeTo('landing'); }} /><div className="sidebar-profile"><ProfileAvatar profile={profile} /><div><strong>{profile.name}</strong><span>@{profile.username}</span></div></div><span className="sidebar-label">YOUR WORKSPACE</span>
            <nav className="owner-navigation" aria-label="Workspace"><button className={section === 'card' ? 'selected' : ''} onClick={() => setSection('card')}><UserRound size={17} /> My card <span>01</span></button><button className={section === 'cards' ? 'selected' : ''} onClick={() => setSection('cards')}><Link2 size={17} /> My links <span>{visibleCards.length.toString().padStart(2, '0')}</span></button><button className={section === 'tools' ? 'selected' : ''} onClick={() => setSection('tools')}><QrCode size={17} /> Share & stats</button><button className={section === 'appearance' ? 'selected' : ''} onClick={() => setSection('appearance')}><Palette size={17} /> Appearance</button><button className={section === 'profile' ? 'selected' : ''} onClick={() => setSection('profile')}><UserRound size={17} /> Profile</button></nav>
            <div className="sidebar-bottom"><button onClick={() => openPublic(profile.username, { addHistory: true })}><ExternalLink size={16} /> View public page</button><button onClick={leaveOwner}><ArrowLeft size={16} /> Log out</button></div>
          </aside>
          <section className="owner-main"><header className="owner-topbar"><div><span className="eyebrow">YOUR TARHETA / {profile.username.toUpperCase()}</span><h1>{section === 'card' ? 'Your calling card' : section === 'cards' ? 'Your little collection' : section === 'appearance' ? 'Make it yours' : section === 'profile' ? 'Your profile' : 'Ready to share?'}</h1></div><div className="owner-top-actions"><button className="button button-outline" onClick={() => section === 'appearance' ? setSection('card') : copyProfile()}>{section === 'appearance' ? <><UserRound size={15} /> Preview my card</> : <><Copy size={15} /> Copy profile link</>}</button><button className="icon-button" onClick={() => setSection('profile')} aria-label="Edit profile"><Pencil size={17} /></button></div></header>
            <div className="mobile-owner-tabs"><button className={section === 'card' ? 'selected' : ''} onClick={() => setSection('card')}>Card</button><button className={section === 'cards' ? 'selected' : ''} onClick={() => setSection('cards')}>Links</button><button className={section === 'tools' ? 'selected' : ''} onClick={() => setSection('tools')}>Share</button><button className={section === 'appearance' ? 'selected' : ''} onClick={() => setSection('appearance')}>Theme</button></div>
            {section === 'card' && <div className="owner-card-section"><div className="owner-note"><span className="status-dot" /> YOUR PAGE IS LOOKING GOOD <span className="owner-views">{Number(profile.views) || 0} local views</span></div><div className="owner-card-center"><ProfileCard profile={profile} flipped={flipped} flip={() => setFlipped((value) => !value)} /><div className="owner-card-help"><span className="flip-icon">↻</span><span><strong>Give it a little tap</strong><small>This card flips over to show your contact details.</small></span><button className="icon-button" onClick={() => setSection('profile')} aria-label="Edit profile details"><Pencil size={16} /></button></div></div><div className="dashboard-bottom"><div><span className="eyebrow">YOUR PAGE ADDRESS</span><p className="share-address">{profileHref}</p></div><Button variant="coral" onClick={() => openPublic(profile.username, { addHistory: true })}>Visit public page <ArrowUpRight size={15} /></Button></div></div>}
            {section === 'cards' &&                         <div className="owner-links-layout"><section className="card-manager"><div className="collection-heading"><div><span className="eyebrow">THE THINGS YOU SHARE</span><h2>Your collection</h2><p>Arrange your links, work, and favorite places.</p></div><Button variant="coral" onClick={() => beginCardEdit()}><Plus size={16} /> Add a card</Button></div><div className="owner-card-list" ref={ownerCardsRef}>{visibleCards.map((card, index) => <div className="draggable-row" key={card.id} draggable onDragOver={(event) => event.preventDefault()} onDragStart={(event) => onDragStart(event, card.id)} onDrop={(event) => onDrop(event, card.id)}><ProfileTile card={card} owner onEdit={beginCardEdit} onDelete={removeCard} onMove={moveCard} onKeyMove={moveCard} /><span className="row-order">{String(index + 1).padStart(2, '0')}</span></div>)}</div></section><aside className="live-preview"><div className="preview-label"><span className="status-dot" /> PUBLIC PREVIEW <ArrowUpRight size={15} /></div><div className="mini-profile"><ProfileAvatar profile={profile} /><div><strong>{profile.name}</strong><span>{getHeadline(profile)}</span></div></div><p>{profile.bio}</p><ProfileCard compact profile={profile} flip={() => setFlipped((value) => !value)} flipped={flipped} /><div className="preview-tile-list">{visibleCards.filter((card) => card.isPublic).map((card) => <ProfileTile key={card.id} card={card} onOpenSchedule={setScheduleDialog} />)}{visibleCards.some((card) => !card.isPublic) && <span className="hidden-cards-note"><ShieldCheck size={14} /> {visibleCards.filter((card) => !card.isPublic).length} private {visibleCards.filter((card) => !card.isPublic).length === 1 ? 'card' : 'cards'} hidden from your public page</span>}</div></aside></div>}
            {section === 'tools' && <div className="tools-layout"><div className="tools-copy"><span className="eyebrow">GOOD THINGS TRAVEL</span><h2>Send your page<br /><em>into the world.</em></h2><p>Copy the link into a message or let someone scan your QR code. Either way, you’re easy to find.</p><Button variant="coral" onClick={copyProfile}><Copy size={15} /> Copy my link</Button><div className="local-metric"><span>{Number(profile.views) || 0}</span><div><strong>profile opens</strong><small>A local demo counter, just for this browser.</small></div></div></div><div className="tools-qr-card"><span className="eyebrow">A LITTLE DOOR BACK TO YOU</span><QRCodeCanvas value={profileHref} size={210} bgColor="#f4f0e6" fgColor="#171a1f" level="M" includeMargin /><strong>Scan to open my Tarheta</strong><span>tarheta.ph/{profile.username}</span><button className="text-link" onClick={(event) => { const canvas = event.currentTarget.parentElement.querySelector('canvas'); const a = document.createElement('a'); a.href = canvas.toDataURL(); a.download = `${profile.username}-qr.png`; a.click(); }}><Download size={15} /> Download QR code</button></div></div>}
            {section === 'appearance' && <AppearancePanel profile={profile} onSave={saveAppearance} />}
            {section === 'profile' && <ProfileSettings profile={profile} onProfileSave={(event) => submitProfile(event, 'edit')} onSocialSave={submitSocialLinks} onPhotoChange={changeProfilePhoto} onRemovePhoto={removeProfilePhoto} onPasswordChange={changePassword} />}
          </section>
          <nav className="owner-mobile-nav"><button className={section === 'card' ? 'selected' : ''} onClick={() => setSection('card')}><UserRound size={18} />Card</button><button className={section === 'cards' ? 'selected' : ''} onClick={() => setSection('cards')}><Link2 size={18} />Links</button><button className={section === 'tools' ? 'selected' : ''} onClick={() => setSection('tools')}><QrCode size={18} />Share</button><button className={section === 'appearance' ? 'selected' : ''} onClick={() => setSection('appearance')}><Palette size={18} />Theme</button><button className={section === 'profile' ? 'selected' : ''} onClick={() => setSection('profile')}><UserRound size={18} />Profile</button></nav>
        </main>
        <Modal title={cardEditing ? 'Tweak this card' : 'Add to your collection'} open={cardDialog} onClose={() => { setCardDialog(false); setCardEditing(null); }}><CardEditorForm key={`${cardDialog}-${cardEditing?.id || 'new'}`} cardEditing={cardEditing} onSubmit={submitCard} /></Modal>
        <ScheduleDialog card={scheduleDialog} onClose={() => setScheduleDialog(null)} />
        <FeedbackWidget profileUsername={profile.username} onToast={showToast} />
        <Toast message={toast} />
      </>
    );
  }
  return null;
}

export default App;
