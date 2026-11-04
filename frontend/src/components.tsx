import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Profile, Result, Totals } from './api';
import { getElapsed, getMicLevel, useStore } from './store';
import { LANGS, OCCUPATIONS, STATES, STATE_OPTIONS, docLabel, inr, reducedMotion } from './lib/util';

const spring = { type: 'spring', stiffness: 260, damping: 24 } as const;

export function Orb() {
  const phase = useStore((s) => s.phase);
  const playing = useStore((s) => s.playing);
  const toggle = useStore((s) => s.toggleMic);
  const ref = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const rec = phase === 'RECORDING';
  const busy = phase === 'TRANSCRIBING' || phase === 'UNDERSTANDING';
  useEffect(() => {
    if (!rec) { if (ref.current) { ref.current.style.transform = ''; ref.current.style.boxShadow = ''; } return; }
    let raf = 0;
    const tick = () => {
      const l = getMicLevel();
      if (ref.current && !reducedMotion()) {
        ref.current.style.transform = `scale(${1 + l * 0.35})`;
        ref.current.style.boxShadow = `0 0 ${40 + l * 90}px rgba(124,92,255,${0.4 + l * 0.5})`;
      }
      if (ring.current) ring.current.style.strokeDashoffset = String(327 * (getElapsed() / 28));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rec]);
  const label = rec ? 'Tap to stop' : busy ? (phase === 'TRANSCRIBING' ? 'Listening…' : 'Understanding…') : 'Tap to speak';
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <button aria-label={label} onClick={() => void toggle()} disabled={busy}
        className="relative flex h-44 w-44 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r="52" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          {rec && <circle ref={ring} cx="55" cy="55" r="52" fill="none" stroke="#22D3EE" strokeWidth="2" strokeDasharray="327" strokeDashoffset="0" strokeLinecap="round" />}
        </svg>
        {rec && <span className="absolute h-36 w-36 animate-ping rounded-full border border-cyan/40" />}
        <div ref={ref} className={`relative h-36 w-36 overflow-hidden rounded-full transition-shadow ${playing ? 'speak' : rec ? '' : 'breathe'}`}
          style={{ background: 'radial-gradient(circle at 30% 30%, #e6c16e, #c66a45 52%, #176b62 115%)', boxShadow: '0 0 36px rgba(23,107,98,.28)' }}>
          {busy && <div className="spin absolute -inset-4 opacity-80" style={{ background: 'conic-gradient(from 0deg, #176b62, #d9a84f, #e8d6b5, #176b62)', filter: 'blur(8px)' }} />}
          <div className="absolute inset-3 rounded-full" style={{ background: 'radial-gradient(circle at 35% 25%, rgba(255,255,255,.35), transparent 60%)' }} />
          <svg className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white" viewBox="0 0 24 24" fill="currentColor">
            {rec ? <rect x="7" y="7" width="10" height="10" rx="2" /> : <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z" />}
          </svg>
        </div>
      </button>
      <p className="text-sm text-muted" aria-live="polite">{label}</p>
    </div>
  );
}

export function LangChips() {
  const hint = useStore((s) => s.langHint);
  const code = useStore((s) => s.langCode);
  const set = useStore((s) => s.setLangHint);
  const phase = useStore((s) => s.phase);
  const active = hint ?? (phase !== 'IDLE' && phase !== 'RECORDING' ? code : null);
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => set(hint === l.code ? null : l.code)} title={l.name}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${active === l.code ? 'grad-bg font-semibold text-white shadow-lg shadow-violet/30' : 'surface text-muted'}`}>
          {l.short}
        </button>
      ))}
    </div>
  );
}

export function Transcript() {
  const t = useStore((s) => s.transcript);
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (reducedMotion()) { setShown(t); return; }
    setShown('');
    let i = 0;
    const id = setInterval(() => { i += 2; setShown(t.slice(0, i)); if (i >= t.length) clearInterval(id); }, 22);
    return () => clearInterval(id);
  }, [t]);
  if (!t) return null;
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="surface select-text rounded-2xl p-4 text-base leading-relaxed">
      {shown}<span className="caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-cyan" />
    </motion.p>
  );
}

export function PersonaPicker() {
  const personas = useStore((s) => s.personas);
  const run = useStore((s) => s.runTranscript);
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">No mic? Try a sample:</p>
      <div className="flex flex-wrap gap-2">
        {personas.map((p) => (
          <button key={p.id} onClick={() => void run(p.transcript, p.language_code)} className="surface rounded-full px-3 py-1.5 text-sm" title={p.blurb}>
            {p.name} <span className="text-muted">· {LANGS.find((l) => l.code === p.language_code)?.name ?? p.language_code}</span>
          </button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void run(text.trim(), useStore.getState().langHint ?? 'hi-IN'); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type about yourself"
          className="surface min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-violet" />
        <button className="grad-bg rounded-full px-4 py-2 text-sm font-semibold">Go</button>
      </form>
    </div>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#14151D] p-5 pb-8"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="text-muted">✕</button></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export { Sheet };

type Field = { key: keyof Profile; label: string; kind: 'num' | 'state' | 'occ' | 'gender' | 'bool' | 'ration'; };
const FIELDS: Field[] = [
  { key: 'age', label: 'Age', kind: 'num' }, { key: 'gender', label: 'Gender', kind: 'gender' },
  { key: 'state', label: 'State', kind: 'state' }, { key: 'occupation', label: 'Occupation', kind: 'occ' },
  { key: 'monthly_income_inr', label: 'Monthly income (₹)', kind: 'num' }, { key: 'household_size', label: 'Household size', kind: 'num' },
  { key: 'ration_card_type', label: 'Ration card', kind: 'ration' }, { key: 'has_bank_account', label: 'Bank account', kind: 'bool' },
  { key: 'owns_farmland', label: 'Owns farmland', kind: 'bool' }, { key: 'is_income_tax_payer', label: 'Income tax payer', kind: 'bool' },
  { key: 'is_epfo_esic_nps_member', label: 'EPFO/ESIC/NPS member', kind: 'bool' }, { key: 'pregnant_or_lactating', label: 'Pregnant / lactating', kind: 'bool' },
];

function show(p: Profile, k: keyof Profile): string | null {
  const v = p[k];
  if (v === null || v === undefined) return null;
  switch (k) {
    case 'age': return `Age ${v}`;
    case 'gender': return String(v);
    case 'state': return STATES[v as string] ?? String(v);
    case 'occupation': return OCCUPATIONS[v as string] ?? String(v);
    case 'monthly_income_inr': return `₹${Number(v).toLocaleString('en-IN')}/mo`;
    case 'household_size': return `${v} in household`;
    case 'ration_card_type': return `Ration: ${String(v).toUpperCase()}`;
    case 'has_bank_account': return v ? 'Has bank account' : 'No bank account';
    case 'owns_farmland': return v ? 'Owns farmland' : 'No farmland';
    case 'is_income_tax_payer': return v ? 'Pays income tax' : 'Not a tax payer';
    case 'is_epfo_esic_nps_member': return v ? 'EPFO/ESIC/NPS' : 'No EPFO/ESIC/NPS';
    case 'pregnant_or_lactating': return v ? 'Pregnant/lactating' : null;
    default: return null;
  }
}

export function ProfileChips() {
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);
  const [edit, setEdit] = useState<Field | null>(null);
  if (!profile) return null;
  const chips: { f: Field; text: string | null }[] = FIELDS.map((f) => ({ f, text: show(profile, f.key) }));
  const deps = profile.dependents.length;
  const set = (k: keyof Profile, v: unknown) => {
    const next = { ...profile, [k]: v, inferred: profile.inferred.filter((x) => x !== k) } as Profile;
    setEdit(null);
    void update(next);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.filter((c) => c.text || ['age', 'state', 'monthly_income_inr', 'occupation'].includes(c.f.key)).map(({ f, text }) => {
          const inferred = profile.inferred.includes(f.key);
          return (
            <button key={f.key} onClick={() => setEdit(f)} title={inferred ? 'assumed' : 'Tap to edit'}
              className={`rounded-full px-3 py-1.5 text-sm ${text ? 'surface' : 'pulse2 border border-dashed border-almost/60 text-almost'} ${inferred ? '!border-dashed !border-white/30' : ''}`}>
              {inferred && <span className="mr-1 text-cyan" title="assumed">✦</span>}{text ?? `+ add ${f.label.toLowerCase()}`}
            </button>
          );
        })}
        {deps > 0 && <span className="surface rounded-full px-3 py-1.5 text-sm">{deps} dependent{deps > 1 ? 's' : ''}</span>}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.label}` : ''}>
        {edit && <Editor f={edit} profile={profile} onSave={set} />}
      </Sheet>
    </div>
  );
}

function Editor({ f, profile, onSave }: { f: Field; profile: Profile; onSave: (k: keyof Profile, v: unknown) => void }) {
  const cur = profile[f.key];
  const [val, setVal] = useState<string>(cur === null || cur === undefined ? '' : String(cur));
  const cls = 'surface w-full rounded-xl bg-transparent px-4 py-3 text-base outline-none';
  const opt = (o: [string, string][]) => (
    <select className={cls + ' [&>option]:bg-[#14151D]'} value={val} onChange={(e) => setVal(e.target.value)}>
      <option value="">—</option>{o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const parse = (): unknown => {
    if (val === '') return null;
    if (f.kind === 'num') return Number(val);
    if (f.kind === 'bool') return val === 'true';
    return val;
  };
  return (
    <div className="space-y-4">
      {f.kind === 'num' && <input type="number" inputMode="numeric" className={cls} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />}
      {f.kind === 'state' && opt(STATE_OPTIONS)}
      {f.kind === 'occ' && opt(Object.entries(OCCUPATIONS))}
      {f.kind === 'gender' && opt([['male', 'Male'], ['female', 'Female'], ['other', 'Other']])}
      {f.kind === 'ration' && opt([['bpl', 'BPL'], ['aay', 'AAY'], ['apl', 'APL'], ['none', 'None']])}
      {f.kind === 'bool' && opt([['true', 'Yes'], ['false', 'No']])}
      <button onClick={() => onSave(f.key, parse())} className="grad-bg w-full rounded-xl py-3 font-semibold">Save & re-check</button>
    </div>
  );
}

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion()) { setV(value); from.current = value; return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 800);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (value - a) * e;
      setV(cur); from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(v)}</>;
}

export function BenefitPocket() {
  const pocket = useStore((s) => s.pocket);
  const matching = useStore((s) => s.matching);
  if (!pocket) return null;
  const e = pocket.eligible, a = pocket.almost;
  const parts: [string, number, (n: number) => string][] = [];
  const add = (t: Totals, tag: string) => {
    void tag;
    return t;
  };
  add(e, '');
  const items: { label: string; v: number; f: (n: number) => string }[] = [];
  if (e.cover) items.push({ label: 'health/life cover', v: e.cover, f: inr });
  if (e.monthly) items.push({ label: 'per month', v: e.monthly, f: (n) => inr(n) });
  if (e.yearly) items.push({ label: 'per year', v: e.yearly, f: inr });
  if (e.one_time) items.push({ label: 'one-time', v: e.one_time, f: inr });
  void parts;
  const aTotal = a.cover + a.monthly + a.yearly + a.one_time;
  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 pb-2 pt-2 backdrop-blur-xl" style={{ background: 'linear-gradient(#0A0B10 70%, transparent)' }}>
      <div className={`surface rounded-2xl p-4 ${matching ? 'opacity-70' : ''}`} style={{ boxShadow: '0 0 30px rgba(34,197,94,.18)' }}>
        <p className="text-xs uppercase tracking-wider text-muted">Your benefit pocket · up to</p>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {items.length === 0 && <span className="text-lg text-muted">No confirmed benefits yet</span>}
          {items.map((i) => (
            <span key={i.label} className="text-eligible"><span className="text-2xl font-bold"><CountUp value={i.v} format={i.f} /></span> <span className="text-xs text-muted">{i.label}</span></span>
          ))}
        </div>
        {aTotal > 0 && <p className="mt-1 text-xs text-almost">+ more unlockable with missing documents</p>}
      </div>
    </div>
  );
}

const BADGE: Record<string, { c: string; t: (r: Result) => string }> = {
  eligible: { c: 'text-eligible bg-eligible/15', t: () => '✅ Eligible' },
  almost: { c: 'text-almost bg-almost/15', t: (r) => `🟠 Almost — ${r.missing_docs.length || 1} doc${r.missing_docs.length > 1 ? 's' : ''} missing` },
  confirm: { c: 'text-confirm bg-confirm/15', t: () => '🔵 Please confirm' },
  not_eligible: { c: 'text-muted bg-white/5', t: () => 'Not eligible' },
};

export function SchemeCard({ r, i }: { r: Result; i: number }) {
  const [open, setOpen] = useState(false);
  const ct = useStore((s) => s.narration?.card_text[r.scheme.id]);
  const b = BADGE[r.status];
  const glow = r.status === 'eligible' ? '0 0 24px rgba(34,197,94,.22)' : undefined;
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ ...spring, delay: Math.min(i, 8) * 0.06 }} className="surface rounded-[20px] p-4" style={{ boxShadow: glow }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{r.scheme.name.hi}</h3>
          <p className="text-sm text-muted">{r.scheme.name.en}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${b.c}`}>{b.t(r)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-cyan">{r.scheme.benefit.label_en}</p>
      {ct?.why ? <p className="mt-2 text-sm leading-relaxed">{ct.why}</p> : <p className="mt-2 text-sm text-muted">{r.scheme.summary_en}</p>}
      {ct?.next_step && <p className="mt-1 text-sm text-muted">→ {ct.next_step}</p>}
      <button onClick={() => setOpen(!open)} className="mt-3 text-xs text-violet" aria-expanded={open}>{open ? 'Hide checklist ▴' : 'Show checklist ▾'}</button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-1 overflow-hidden text-sm">
            {r.rules.map((x) => (
              <li key={x.id} className="flex gap-2"><span className={x.outcome === 'pass' ? 'text-eligible' : x.outcome === 'fail' ? 'text-red-400' : 'text-confirm'}>{x.outcome === 'pass' ? '✓' : x.outcome === 'fail' ? '✗' : '?'}</span>{x.label_en}</li>
            ))}
            {r.scheme.required_docs.map((d) => {
              const miss = r.missing_docs.includes(d);
              return <li key={d} className="flex gap-2"><span className={miss ? 'text-red-400' : 'text-eligible'}>{miss ? '✗' : '✓'}</span>Document: {docLabel(d)}</li>;
            })}
          </motion.ul>
        )}
      </AnimatePresence>
      {r.status !== 'not_eligible' && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">{r.scheme.how_to_apply_en}</p>
          <a href={r.scheme.apply_url} target="_blank" rel="noreferrer noopener" className="grad-bg inline-block rounded-full px-4 py-2 text-sm font-semibold">How to apply</a>
        </div>
      )}
    </motion.div>
  );
}

export function Narrator() {
  const n = useStore((s) => s.narration);
  const narrating = useStore((s) => s.narrating);
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const url = useStore((s) => s.audioUrl);
  const toggle = useStore((s) => s.togglePlay);
  const [text, setText] = useState(false);
  if (!n && !narrating) return null;
  return (
    <div className="surface rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <button onClick={toggle} disabled={!url} aria-label={playing ? 'Pause' : 'Play'} className="grad-bg flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40">{playing ? '⏸' : '▶'}</button>
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="grad-bg h-full" style={{ width: `${(narrating ? 0.1 : progress) * 100}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{narrating ? 'Preparing narration…' : url ? 'Listen to your summary' : 'Audio unavailable — read the summary'}</p>
        </div>
        {n && <button onClick={() => setText(!text)} className="text-xs text-violet">{text ? 'Hide text' : 'Show text'}</button>}
      </div>
      {text && n && <p className="mt-3 text-sm leading-relaxed">{n.script}</p>}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-[460px] flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert"
            className="flex items-center gap-3 rounded-xl border border-red-400/30 bg-[#2A1417] p-3 text-sm">
            <span className="flex-1">{t.message}</span>
            {t.retry && <button className="font-semibold text-cyan" onClick={() => { t.retry?.(); dismiss(t.id); }}>Retry</button>}
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted">✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
