import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store';
import { BenefitPocket, LangChips, Narrator, Orb, PersonaPicker, ProfileChips, SchemeCard, Toasts, Transcript } from './components';

const ScanSheet = lazy(() => import('./ScanSheet'));
const Mark = () => <div className="brand-mark" aria-hidden="true"><span>सा</span></div>;

export default function App() {
  const s = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [notFor, setNotFor] = useState(false);
  const [portal, setPortal] = useState(false);
  const prevResultsLen = useRef(0);
  const input = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null), workspace = useRef<HTMLElement>(null);

  useEffect(() => { s.init(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (s.results.length > 0 && prevResultsLen.current === 0) {
      setPortal(true);
    }
    prevResultsLen.current = s.results.length;
  }, [s.results.length]);

  const hasResults = s.results.length > 0;
  const rank = { eligible: 0, almost: 1, confirm: 2, not_eligible: 3 } as const;
  const sorted = [...s.results].sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score);
  const yes = sorted.filter((r) => r.status !== 'not_eligible'), no = sorted.filter((r) => r.status === 'not_eligible');
  const pick = (f?: File) => { if (f) { setFile(f); void s.scanFile(f); } };

  const enter = () => {
    setPortal(true);
    requestAnimationFrame(() => workspace.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const goHome = () => {
    setPortal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return <div className="app-shell">
    <header className="site-header">
      <button className="brand" onClick={goHome} aria-label="Go to home">
        <Mark />
        <span>Sarkari Sahayak</span>
      </button>
      <nav aria-label="Primary navigation">
        {portal ? (
          <button onClick={goHome} className="nav-back-home" style={{ cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', color: 'inherit' }}>
            ← Home
          </button>
        ) : (
          <>
            <button onClick={enter}>Find schemes</button>
            <a href="#how-it-works">How it works</a>
          </>
        )}
      </nav>
      {portal ? (
        <button className="header-cta" onClick={goHome}>
          ← Back to Home
        </button>
      ) : (
        <button className="header-cta" onClick={enter}>
          Start here <span>→</span>
        </button>
      )}
    </header>

    <AnimatePresence mode="wait">{!portal ? <motion.main key="home" className="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }}>
      <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow">A clearer path to public support</p><h1 id="hero-title">The help you qualify for,<br /><em>made easier to find.</em></h1><p className="hero-description">Tell us about your life in the language you speak. We turn it into a straightforward, private shortlist of government schemes and the next steps for each one.</p><div className="hero-actions"><button className="primary-action" onClick={enter}>Find my schemes <span>→</span></button><a href="#how-it-works" className="text-action">See how it works <span>↓</span></a></div><div className="trust-row"><span>Free to use</span><i /><span>Your details stay with you</span><i /><span>Many Indian languages</span></div></div><div className="hero-art" aria-label="Scheme discovery preview"><div className="art-caption">A thoughtful guide, not a maze.</div><div className="paper-stack"><div className="mini-card mini-card-back"><span className="mini-icon">✓</span><div><small>Documents</small><b>What you need, simply listed</b></div></div><div className="mini-card mini-card-front"><div className="card-top"><span className="mini-icon">₹</span><small>YOUR MATCHES</small><span className="dots">•••</span></div><b>Support that meets you where you are.</b><div className="match-line"><span>3 schemes to explore</span><strong>View →</strong></div></div></div><div className="sun-shape" /></div></section>
      <section className="assurance" id="how-it-works"><p className="eyebrow">Built around real life</p><div className="assurance-grid"><article><span>01</span><h2>Speak naturally</h2><p>No forms to decipher. Share what you are comfortable sharing, in your own words.</p></article><article><span>02</span><h2>See what fits</h2><p>We explain likely matches, documents, and what still needs checking.</p></article><article><span>03</span><h2>Move forward</h2><p>Take the next step with a clear checklist and official application links.</p></article></div></section>
    </motion.main> : <motion.main key="portal" ref={workspace} className="portal" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <section className="portal-intro">
        <div>
          <button onClick={goHome} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(23,107,98,0.08)', border: '1px solid rgba(23,107,98,0.25)', color: '#176b62', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginBottom: '14px' }}>
            ← Back to Home
          </button>
          <p className="eyebrow">Your scheme finder</p>
          <h1>Let’s find support that <em>fits your life.</em></h1>
          <p>Speak, type, or use a sample story. You can review every detail before it is used.</p>
        </div>
        <aside><span className="safe-dot" /> Nothing is submitted on your behalf</aside>
      </section>
      <div className="portal-grid"><section className="listen-panel" aria-label="Tell us about yourself"><div className="step-label"><span>1</span><p><b>Tell us a little about yourself</b><small>Choose a language, then speak naturally.</small></p></div><LangChips /><Orb /><Transcript />{!hasResults && <PersonaPicker />}{s.phase === 'UNDERSTANDING' && <p className="finding-message">Reading your story and checking what may fit…</p>}{hasResults && <div className="profile-area"><div className="section-heading"><div><b>Your details</b><p>Tap anything to correct it</p></div><span>Step 2</span></div><ProfileChips /></div>}</section><aside className="help-panel"><div className="help-symbol">?</div><h2>Speak your way.</h2><p>You do not need to know scheme names, technical terms, or exactly which document you have.</p><p>For example: <q>I work as a driver in Pune and earn around ₹15,000 a month.</q></p><div className="privacy-note"><b>Private by design</b><span>We only use what is needed to check possible matches.</span></div></aside></div>
      {hasResults && <section className="results" aria-live="polite"><div className="results-heading"><div><p className="eyebrow">Your results</p><h2>Here is what we found <em>for you.</em></h2></div><span>{yes.length} to explore</span></div><BenefitPocket /><Narrator /><div className="document-actions"><div><b>Have a document handy?</b><p>Scan it to make your checklist more accurate.</p></div><div><button onClick={() => input.current?.click()} className="secondary-action">Scan a document</button><button onClick={() => gallery.current?.click()} className="quiet-action">Choose from device</button></div><input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /><input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></div><div className="scheme-grid"><AnimatePresence>{yes.map((r, i) => <SchemeCard key={r.scheme.id} r={r} i={i} />)}</AnimatePresence></div>{no.length > 0 && <div className="not-for"><button onClick={() => setNotFor(!notFor)} aria-expanded={notFor}>Not a match right now <span>{no.length}</span> {notFor ? '−' : '+'}</button>{notFor && <ul>{no.map((r) => <li key={r.scheme.id}><b>{r.scheme.name.en}</b><span>{r.failed_labels.length ? r.failed_labels.join('; ') : 'Eligibility rules not met'}</span></li>)}</ul>}</div>}</section>}
    </motion.main>}</AnimatePresence>
    <footer className="site-footer"><span>Indicative guidance only. Final eligibility is decided by the relevant department.</span>{(s.health?.verified_on || s.verifiedOn) && <span>Scheme data checked: {s.verifiedOn || s.health?.verified_on}</span>}<button onClick={s.reset}>Clear my data</button></footer><Suspense fallback={null}>{file && <ScanSheet file={file} onClose={() => setFile(null)} />}</Suspense><Toasts />
  </div>;
}
