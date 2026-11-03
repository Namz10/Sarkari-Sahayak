import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet } from './components';
import { useStore } from './store';
import { docLabel, maskValue } from './lib/util';

export default function ScanSheet({ file, onClose }: { file: File | null; onClose: () => void }) {
  const phase = useStore((s) => s.phase);
  const doc = useStore((s) => s.doc);
  const confirm = useStore((s) => s.confirmDoc);
  const cancel = useStore((s) => s.cancelDoc);
  const [url, setUrl] = useState('');
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const entries = doc ? Object.entries(doc.fields).filter(([, v]) => v !== null && v !== '') : [];
  useEffect(() => {
    setShown(0);
    if (!entries.length) return;
    const id = setInterval(() => setShown((n) => { if (n >= entries.length) { clearInterval(id); return n; } return n + 1; }), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);
  const open = !!file && (phase === 'SCANNING' || phase === 'CONFIRMING_DOC');
  const close = () => { cancel(); onClose(); };
  return (
    <Sheet open={open} onClose={close} title={phase === 'SCANNING' ? 'Reading your document…' : 'We read this'}>
      <div className="relative mb-4 h-48 overflow-hidden rounded-2xl bg-black/40">
        {url && <img src={url} alt="Document preview" className="h-full w-full object-contain" />}
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.4) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
        {phase === 'SCANNING' && <div className="scanline" />}
      </div>
      {doc && (
        <>
          <p className="mb-2 text-sm text-muted">{docLabel(doc.doc_type)} · {Math.round(doc.confidence * 100)}% confident</p>
          <div className="mb-4 space-y-2">
            {entries.slice(0, shown).map(([k, v]) => (
              <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between rounded-xl border border-cyan/40 bg-cyan/10 px-3 py-2 text-sm">
                <span className="capitalize text-muted">{k.replace(/_/g, ' ')}</span><span className="font-medium">{maskValue(k, v)}</span>
              </motion.div>
            ))}
            {entries.length === 0 && <p className="text-sm text-muted">No readable fields found.</p>}
          </div>
          <p className="mb-3 text-sm">Use these to update your profile?</p>
          <div className="flex gap-3">
            <button onClick={close} className="surface flex-1 rounded-xl py-3">Discard</button>
            <button onClick={() => { void confirm(); onClose(); }} className="grad-bg flex-1 rounded-xl py-3 font-semibold">Use these</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
