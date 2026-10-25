import { useEffect, useRef, useState } from 'react';
import { Bug, Check, ChevronRight, ImagePlus, MessageSquarePlus, X } from 'lucide-react';

const TYPES = [
  { value: 'bug', label: 'Bug report', placeholder: 'What happened? What did you expect? Steps to reproduce.' },
  { value: 'problem', label: 'Problem / issue', placeholder: 'Tell us what went wrong or what made your visit difficult.' },
  { value: 'feature', label: 'Feature suggestion', placeholder: 'What would make Tarheta more useful or delightful?' },
  { value: 'other', label: 'Other', placeholder: 'Share anything else you would like us to know.' },
];
const SEVERITIES = ['low', 'medium', 'high'];
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function getImagePreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('Could not prepare the screenshot.'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = () => reject(new Error('The selected file is not a valid image.'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read the selected screenshot.'));
    reader.readAsDataURL(file);
  });
}

function FeedbackModal({ onClose, onToast, profileUsername }) {
  const [type, setType] = useState('bug');
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', email: '', website: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [reference, setReference] = useState('');
  const titleRef = useRef(null);
  const dialogRef = useRef(null);
  const firstFocusable = useRef(null);
  const selectedType = TYPES.find((item) => item.value === type) || TYPES[0];

  useEffect(() => {
    titleRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const update = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  };
  const chooseScreenshot = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setErrors((current) => ({ ...current, screenshot: 'Choose a PNG, JPG, or WebP image.' }));
    if (file.size > MAX_SCREENSHOT_BYTES) return setErrors((current) => ({ ...current, screenshot: 'Screenshots must be smaller than 5 MB.' }));
    try {
      setScreenshot({ name: file.name, preview: await getImagePreview(file) });
      setErrors((current) => ({ ...current, screenshot: '' }));
    } catch (error) {
      setErrors((current) => ({ ...current, screenshot: error.message }));
    }
  };
  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Give your report a short title.';
    if (form.title.trim().length > 100) next.title = 'Keep the title under 100 characters.';
    if (form.description.trim().length < 10) next.description = 'Add at least 10 characters so we can understand the context.';
    if (form.description.trim().length > 1000) next.description = 'Keep the description under 1,000 characters.';
    if ((type === 'bug' || type === 'problem') && !SEVERITIES.includes(form.severity)) next.severity = 'Choose a severity.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (form.website) return;
    if (!validate()) return;
    setStatus('submitting');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, title: form.title.trim(), description: form.description.trim(),
          severity: type === 'bug' || type === 'problem' ? form.severity : null,
          email: form.email.trim(), screenshot: screenshot?.preview || '',
          pageUrl: window.location.href, profileUsername: profileUsername || '',
          userAgent: navigator.userAgent, screenSize: `${window.innerWidth}x${window.innerHeight}`,
          website: form.website,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not send your feedback.');
      setReference(result.refCode);
      setStatus('success');
      onToast('Feedback sent. Thank you.');
    } catch (error) {
      setStatus('idle');
      onToast(error.message || 'Could not send your feedback.');
    }
  };

  return (
    <div className="feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" ref={dialogRef}>
        <button className="feedback-close" type="button" onClick={onClose} aria-label="Close feedback form"><X size={18} /></button>
        {status === 'success' ? (
          <div className="feedback-success">
            <span className="feedback-success-mark"><Check size={23} /></span>
            <span className="eyebrow">THANK YOU FOR CARING</span>
            <h2 id="feedback-title">Your note is on its way.</h2>
            <p>We’ll look into it. Keep this reference handy in case you need to follow up.</p>
            <strong className="feedback-reference">{reference}</strong>
            <button className="button button-coral form-submit" type="button" onClick={onClose}>Close <ChevronRight size={16} /></button>
          </div>
        ) : (
          <>
            <span className="eyebrow"><MessageSquarePlus size={14} /> A NOTE FOR TARHETA</span>
            <h2 id="feedback-title">How can we make this better?</h2>
            <p className="feedback-intro">Report a bug, tell us about a problem, or share an idea. Every note helps.</p>
            <form onSubmit={submit} noValidate>
              <label className="feedback-field"><span>What kind of note is this?</span><div className="feedback-type-grid">{TYPES.map((item) => <button key={item.value} type="button" className={`feedback-chip ${type === item.value ? 'is-selected' : ''}`} onClick={() => { setType(item.value); setErrors({}); }}>{item.label}</button>)}</div></label>
              <label className="form-field feedback-field"><span>Title <i>Required</i></span><input ref={(node) => { titleRef.current = node; firstFocusable.current = node; }} value={form.title} onChange={(event) => update('title', event.target.value)} maxLength="100" placeholder="Give your feedback a clear title" aria-invalid={Boolean(errors.title)} />{errors.title && <small className="feedback-error">{errors.title}</small>}</label>
              <label className="form-field feedback-field"><span>Description <i>Required</i></span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} maxLength="1000" rows="5" placeholder={selectedType.placeholder} aria-invalid={Boolean(errors.description)} /> <small className="feedback-counter">{form.description.length}/1000</small>{errors.description && <small className="feedback-error">{errors.description}</small>}</label>
              {(type === 'bug' || type === 'problem') && <fieldset className="feedback-fieldset"><legend>Severity</legend><div className="feedback-severity">{SEVERITIES.map((item) => <label key={item} className={`feedback-severity-option ${form.severity === item ? 'is-selected' : ''}`}><input type="radio" name="severity" value={item} checked={form.severity === item} onChange={(event) => update('severity', event.target.value)} />{item}</label>)}</div>{errors.severity && <small className="feedback-error">{errors.severity}</small>}</fieldset>}
              <div className="feedback-fieldset"><span className="feedback-label">Screenshot <i>Optional · PNG, JPG, or WebP · 5 MB max</i></span><label className="feedback-upload"><ImagePlus size={16} /> {screenshot ? screenshot.name : 'Choose an image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseScreenshot} /></label>{screenshot && <div className="feedback-preview"><img src={screenshot.preview} alt="Screenshot preview" /><button type="button" className="icon-button" onClick={() => setScreenshot(null)} aria-label="Remove screenshot"><X size={15} /></button></div>}{errors.screenshot && <small className="feedback-error">{errors.screenshot}</small>}</div>
              <label className="form-field feedback-field"><span>Contact email <i>Optional · only used to follow up</i></span><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength="254" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} />{errors.email && <small className="feedback-error">{errors.email}</small>}</label>
              <label className="feedback-honeypot" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={(event) => update('website', event.target.value)} /></label>
              <button className="button button-coral form-submit" type="submit" disabled={status === 'submitting'}>{status === 'submitting' ? 'Sending note…' : 'Send feedback'} <ChevronRight size={16} /></button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

export function FeedbackWidget({ onToast, profileUsername = '' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="feedback-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open website feedback form"><Bug size={16} /><span>Feedback</span></button>
    {open && <FeedbackModal profileUsername={profileUsername} onClose={() => setOpen(false)} onToast={onToast} />}
  </>;
}

function AdminLogin({ onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/feedback', { headers: { 'X-Admin-Password': password } });
    if (!response.ok) return setError('That admin password was not accepted.');
    onAuthenticated(password, await response.json());
  };
  return <form className="admin-login" onSubmit={submit}><span className="eyebrow">TARHETA ADMIN</span><h1>Feedback inbox.</h1><p>Enter the server-side admin password to view reports.</p><label className="form-field"><span>Admin password</span><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="feedback-error">{error}</p>}<button className="button button-coral form-submit" type="submit">Open inbox <ChevronRight size={16} /></button></form>;
}

export function AdminFeedbackPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ type: '', severity: '', status: '', q: '' });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const load = async (secret = password) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const response = await fetch(`/api/feedback?${params}`, { headers: { 'X-Admin-Password': secret } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not load feedback.');
    setData(result);
  };
  if (!data) return <main className="admin-page"><AdminLogin onAuthenticated={(secret, result) => { setPassword(secret); setData(result); }} /></main>;
  const updateStatus = async (id, status) => {
    const response = await fetch('/api/feedback', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, body: JSON.stringify({ id, status }) });
    if (!response.ok) return setError('Could not update that report.');
    await load();
    setSelected((current) => current ? { ...current, status } : current);
  };
  return <main className="admin-page"><header className="admin-header"><div><span className="eyebrow">TARHETA ADMIN</span><h1>Feedback inbox.</h1></div><a href="/" className="button button-outline">Back to site</a></header><div className="admin-filters">{['type', 'severity', 'status'].map((name) => <select key={name} value={filters[name]} onChange={(event) => setFilters((current) => ({ ...current, [name]: event.target.value }))}><option value="">{name[0].toUpperCase() + name.slice(1)} · all</option>{(name === 'type' ? TYPES : name === 'severity' ? SEVERITIES : ['new', 'in_progress', 'resolved', 'wont_fix']).map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select>)}<input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search title or text" /><button className="button button-coral" type="button" onClick={() => load().catch((loadError) => setError(loadError.message))}>Filter</button></div>{error && <p className="feedback-error">{error}</p>}<div className="admin-layout"><div className="admin-list">{data.reports.map((report) => <button type="button" className={`admin-report ${selected?.id === report.id ? 'is-selected' : ''}`} key={report.id} onClick={() => setSelected(report)}><span className="eyebrow">{report.ref_code} · {report.status}</span><strong>{report.title}</strong><small>{report.type} · {new Date(report.created_at).toLocaleString()}</small></button>)}{!data.reports.length && <p className="admin-empty">No feedback matches these filters.</p>}</div>{selected && <article className="admin-detail"><span className="eyebrow">{selected.ref_code}</span><h2>{selected.title}</h2><p className="admin-meta">{selected.type} {selected.severity ? `· ${selected.severity}` : ''} · {new Date(selected.created_at).toLocaleString()}</p><p className="admin-description">{selected.description}</p>{selected.email && <p className="admin-meta">Follow up: <a href={`mailto:${selected.email}`}>{selected.email}</a></p>}{selected.screenshot_url && <img className="admin-screenshot" src={selected.screenshot_url} alt={`Screenshot for ${selected.title}`} />}<label className="form-field"><span>Status</span><select value={selected.status} onChange={(event) => updateStatus(selected.id, event.target.value)}><option value="new">New</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="wont_fix">Won’t Fix</option></select></label></article>}</div></main>;
}
