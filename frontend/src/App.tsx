import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store';
import { BenefitPocket, LangChips, Narrator, Orb, PersonaPicker, ProfileChips, SchemeCard, Toasts, Transcript } from './components';

const ScanSheet = lazy(() => import('./ScanSheet'));

export default function App() {
  const s = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [notFor, setNotFor] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  useEffect(() => { s.init(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hasResults = s.results.length > 0;
  const rank = { eligible: 0, almost: 1, confirm: 2, not_eligible: 3 } as const;
  const sorted = [...s.results].sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score);
  const yes = sorted.filter((r) => r.status !== 'not_eligible');
  const no = sorted.filter((r) => r.status === 'not_eligible');
  const pick = (f?: File) => { if (f) { setFile(f); void s.scanFile(f); } };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: 'linear-gradient(135deg,#7C5CFF,#22D3EE)' }} />
      <main className="relative mx-auto min-h-screen max-w-[480px] space-y-4 px-4 pb-10 sm:border-x sm:border-white/5">
        <header className="pt-6 text-center">
          <h1 className="text-xl font-bold"><span className="grad-text">Sarkari Sahayak</span> · सरकारी सहायक</h1>
          <p className="mt-1 text-sm text-muted">Bolo. Dikhao. Suno.</p>
        </header>

        <BenefitPocket />
        <Orb />
        <LangChips />
        <Transcript />
        {s.phase === 'IDLE' && !hasResults && <PersonaPicker />}
        {s.phase === 'UNDERSTANDING' && <p className="pulse2 text-center text-sm text-muted">Finding schemes for you…</p>}
        <ProfileChips />

        {hasResults && (
          <>
            <Narrator />
            <div className="flex gap-2">
              <button onClick={() => input.current?.click()} className="grad-bg flex-1 rounded-xl py-3 text-sm font-semibold">📷 Scan a document</button>
              <button onClick={() => gallery.current?.click()} className="surface rounded-xl px-4 py-3 text-sm">Gallery</button>
              <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <motion.div layout className="space-y-3">
              <AnimatePresence>{yes.map((r, i) => <SchemeCard key={r.scheme.id} r={r} i={i} />)}</AnimatePresence>
            </motion.div>
            {no.length > 0 && (
              <div>
                <button onClick={() => setNotFor(!notFor)} className="surface w-full rounded-xl px-4 py-3 text-left text-sm text-muted" aria-expanded={notFor}>
                  Not for you (and why) · {no.length} {notFor ? '▴' : '▾'}
                </button>
                {notFor && (
                  <ul className="mt-2 space-y-2">
                    {no.map((r) => (
                      <li key={r.scheme.id} className="surface rounded-xl p-3 text-sm">
                        <p className="font-medium">{r.scheme.name.en}</p>
                        <p className="text-xs text-muted">{r.failed_labels.length ? r.failed_labels.join('; ') : 'Eligibility rules not met'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <footer className="space-y-2 pt-6 text-center text-xs text-muted">
          <p>Indicative guidance, not an official decision. Final eligibility is decided by the department.</p>
          {(s.health?.verified_on || s.verifiedOn) && <p>Scheme data last verified: {s.verifiedOn || s.health?.verified_on}</p>}
          <div className="flex items-center justify-center gap-3">
            {s.health?.mode === 'fixtures' && <span className="rounded-full bg-almost/15 px-2.5 py-1 text-almost">Demo mode</span>}
            <button onClick={s.reset} className="underline">Clear my data</button>
          </div>
        </footer>
      </main>
      <Suspense fallback={null}>{file && <ScanSheet file={file} onClose={() => setFile(null)} />}</Suspense>
      <Toasts />
    </div>
  );
}
