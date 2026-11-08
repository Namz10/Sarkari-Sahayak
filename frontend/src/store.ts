import { create } from 'zustand';
import { api, ApiError, type DocResponse, type Health, type Narration, type Persona, type Pocket, type Profile, type QuestionPlan, type Result } from './api';
import { Recorder, TooShortError, blobToWav16k, downscaleImage } from './lib/audio';
import { b64ToUrl } from './lib/util';

export type Phase = 'IDLE' | 'RECORDING' | 'TRANSCRIBING' | 'UNDERSTANDING' | 'RESULTS' | 'SCANNING' | 'CONFIRMING_DOC';

export const emptyProfile = (): Profile => ({
  age: null, gender: null, state: null, occupation: null, monthly_income_inr: null, household_size: null,
  dependents: [], pregnant_or_lactating: null, owns_farmland: null, is_income_tax_payer: null,
  is_epfo_esic_nps_member: null, has_bank_account: null, ration_card_type: null, docs_held: [], inferred: [], needs: [],
  name: null, aadhaar_linked_to_bank: null, receives_other_pension: null,
});

interface Toast { id: number; message: string; retry?: () => void }

interface State {
  phase: Phase;
  langHint: string | null;
  langCode: string;
  transcript: string;
  profile: Profile | null;
  results: Result[];
  pocket: Pocket | null;
  verifiedOn: string;
  health: Health | null;
  personas: Persona[];
  narration: Narration | null;
  narrating: boolean;
  audioUrl: string;
  playing: boolean;
  progress: number;
  matching: boolean;
  doc: DocResponse | null;
  toasts: Toast[];
  questions: QuestionPlan | null;
  questionAttempts: number;
  conversation: string[];
  askedFields: string[];
  finalizing: boolean;
  finishQuestions: () => Promise<void>;
  init: () => void;
  setLangHint: (c: string | null) => void;
  toggleMic: () => Promise<void>;
  runTranscript: (t: string, lang: string) => Promise<void>;
  updateProfile: (p: Profile) => Promise<void>;
  scanFile: (f: File) => Promise<void>;
  confirmDoc: () => Promise<void>;
  cancelDoc: () => void;
  togglePlay: () => void;
  dismissToast: (id: number) => void;
  reset: () => void;
}

const recorder = new Recorder();
export const getMicLevel = () => recorder.getLevel();
export const getElapsed = () => recorder.elapsed();
const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
let unlocked = false;
let ctrl: AbortController | null = null;
let toastId = 1;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function unlockAudio() {
  if (unlocked || !audio) return;
  unlocked = true;
  audio.src = SILENT;
  void audio.play().catch(() => { unlocked = false; });
}

const newCtrl = () => { ctrl?.abort(); ctrl = new AbortController(); return ctrl.signal; };

export const useStore = create<State>((set, get) => {
  const fail = (e: unknown, retry?: () => void) => {
    if (e instanceof ApiError && e.aborted) return;
    const message = e instanceof Error ? e.message : 'Something went wrong';
    const t: Toast = { id: toastId++, message, retry: !(e instanceof ApiError) || e.retryable ? retry : undefined };
    set((s) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => get().dismissToast(t.id), 8000);
  };

  const narrate = async () => {
    const { results, pocket, profile, langCode } = get();
    if (!pocket || !profile) return;
    set({ narrating: true });
    try {
      const n = await api.narrate(results, pocket, profile, langCode);
      const url = n.audio_b64 ? b64ToUrl(n.audio_b64, n.audio_mime) : '';
      set({ narration: n, audioUrl: url, narrating: false });
      if (url) {
        audio.src = url;
        audio.play().then(() => set({ playing: true })).catch(() => set({ playing: false }));
      }
    } catch (e) { set({ narrating: false }); fail(e, () => void narrate()); }
  };

  const match = async (profile: Profile) => {
    set({ matching: true });
    try {
      const m = await api.match(profile, profile.docs_held, newCtrl());
      set({ profile, results: m.results, pocket: m.pocket, verifiedOn: m.verified_on, phase: 'RESULTS', matching: false, questions: null, finalizing: false });
      void narrate();
    } catch (e) {
      set({ matching: false, phase: get().results.length ? 'RESULTS' : 'IDLE' });
      fail(e, () => void match(profile));
    }
  };

  const understand = async (transcript: string, lang: string) => {
    set({ phase: 'UNDERSTANDING', transcript, langCode: lang, narration: null, audioUrl: '' });
    try {
      const r = await api.profile(transcript, lang, newCtrl());
      if (r.language_code) set({ langCode: r.language_code });
      const previous = get().profile;
      const merged = previous ? {
        ...previous,
        ...Object.fromEntries(Object.entries(r.profile).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0))),
        docs_held: Array.from(new Set([...previous.docs_held, ...r.profile.docs_held])),
        inferred: Array.from(new Set([...previous.inferred, ...r.profile.inferred])),
        needs: Array.from(new Set([...previous.needs, ...r.profile.needs])),
      } as Profile : r.profile;
      if (previous) set((s) => ({ questionAttempts: s.questionAttempts + 1 }));
      const attempts = get().questionAttempts;
      if (previous) set({ profile: merged, transcript, questionAttempts: attempts + 1 });
      const conversation = [...get().conversation, transcript];
      const askedFields = get().askedFields;
      const plan = await api.questions(merged, get().langCode, previous ? attempts + 1 : 0, conversation.join('\n'), askedFields, newCtrl());
      if (plan.questions[0]) set({ askedFields: [...askedFields, plan.questions[0].id] });
      set({ conversation });
      set({ questions: plan, phase: 'RESULTS', profile: merged, results: [], pocket: null });
      if (plan.done || !plan.questions.length || (previous && attempts + 1 >= 2)) await get().finishQuestions();
      else {
        const spoken = await api.speak(plan.prompt ?? plan.questions.map((q) => q.text).join(' '), get().langCode);
        if (spoken) { audio.src = `data:audio/wav;base64,${spoken}`; await audio.play().catch(() => undefined); }
      }
    } catch (e) { set({ phase: 'IDLE' }); fail(e, () => void understand(transcript, lang)); }
  };

  if (audio) {
    audio.addEventListener('ended', () => set({ playing: false, progress: 0 }));
    audio.addEventListener('pause', () => set({ playing: false }));
    audio.addEventListener('play', () => { if (get().audioUrl) set({ playing: true }); });
    audio.addEventListener('timeupdate', () => set({ progress: audio.duration ? audio.currentTime / audio.duration : 0 }));
  }

  const stopAndProcess = async () => {
    set({ phase: 'TRANSCRIBING' });
    try {
      const blob = await recorder.stop();
      const { wav } = await blobToWav16k(blob);
      const t = await api.transcribe(wav, get().langHint, newCtrl());
      if (!t.transcript.trim()) throw new ApiError("We couldn't hear anything. Please try again.", 'empty', false);
      await understand(t.transcript, t.language_code);
    } catch (e) {
      set({ phase: 'IDLE' });
      if (e instanceof TooShortError) fail(new Error('Too short, please speak for at least a couple of seconds.'));
      else fail(e);
    }
  };

  return {
    phase: 'IDLE', langHint: null, langCode: 'hi-IN', transcript: '', profile: null, results: [], pocket: null,
    verifiedOn: '', health: null, personas: [], narration: null, narrating: false, audioUrl: '', playing: false,
    progress: 0, matching: false, doc: null, toasts: [], questions: null, questionAttempts: 0, finalizing: false, conversation: [], askedFields: [],
    finishQuestions: async () => {
      if (get().finalizing || !get().profile) return;
      set({ finalizing: true, matching: true });
      await match(get().profile!);
    },
    init: () => {
      api.health().then((h) => set({ health: h, verifiedOn: h.verified_on })).catch(() => undefined);
      api.personas().then((p) => set({ personas: p })).catch(() => undefined);
    },
    setLangHint: (c) => set({ langHint: c }),
    toggleMic: async () => {
      unlockAudio();
      navigator.vibrate?.(10);
      const { phase } = get();
      if (phase === 'RECORDING') {
        if (recorder.elapsed() < 1.2) { recorder.cancel(); set({ phase: 'IDLE' }); fail(new Error('Too short, hold on a little longer.')); return; }
        return stopAndProcess();
      }
      if (phase !== 'IDLE' && phase !== 'RESULTS') return;
      try {
        audio?.pause();
        await recorder.start(() => { if (get().phase === 'RECORDING') void stopAndProcess(); });
        set({ phase: 'RECORDING', transcript: '' });
      } catch {
        fail(new Error('Microphone unavailable. Allow mic access or try a persona below.'));
      }
    },
    runTranscript: async (t, lang) => { unlockAudio(); await understand(t, lang); },
    updateProfile: async (p) => { await match(p); },
    scanFile: async (f) => {
      set({ phase: 'SCANNING', doc: null });
      try {
        const img = await downscaleImage(f);
        const d = await api.document(img, get().langCode, newCtrl());
        set({ doc: d, phase: 'CONFIRMING_DOC' });
      } catch (e) { set({ phase: 'RESULTS' }); fail(e); }
    },
    confirmDoc: async () => {
      const { doc, profile } = get();
      if (!doc || !profile) return;
      const merged: Profile = { ...profile };
      for (const [k, v] of Object.entries(doc.profile_patch ?? {})) {
        if (v !== null && v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
      }
      merged.docs_held = Array.from(new Set([...profile.docs_held, ...(doc.docs_held_add ?? []), ...(merged.docs_held ?? [])]));
      set({ doc: null, phase: 'RESULTS' });
      await match(merged);
    },
    cancelDoc: () => set({ doc: null, phase: 'RESULTS' }),
    togglePlay: () => {
      unlockAudio();
      if (!get().audioUrl) return;
      if (audio.paused) {
        if (audio.src !== get().audioUrl) audio.src = get().audioUrl;
        void audio.play();
      } else audio.pause();
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    reset: () => {
      ctrl?.abort(); recorder.cancel(); audio?.pause();
      set({
        phase: 'IDLE', langCode: 'hi-IN', transcript: '', profile: null, results: [], pocket: null, verifiedOn: '', narration: null, audioUrl: '',
        playing: false, progress: 0, doc: null, langHint: null, narrating: false, matching: false, questions: null, questionAttempts: 0, finalizing: false, conversation: [], askedFields: [],
      });
    },
  };
});
