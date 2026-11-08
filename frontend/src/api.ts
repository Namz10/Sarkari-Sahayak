export type Gender = 'male' | 'female' | 'other';
export type RationType = 'bpl' | 'aay' | 'apl' | 'none';
export interface Dependent { relation: string; age: number | null; gender: string | null }
export interface Profile {
  age: number | null;
  gender: Gender | null;
  state: string | null;
  occupation: string | null;
  monthly_income_inr: number | null;
  household_size: number | null;
  dependents: Dependent[];
  pregnant_or_lactating: boolean | null;
  owns_farmland: boolean | null;
  is_income_tax_payer: boolean | null;
  is_epfo_esic_nps_member: boolean | null;
  has_bank_account: boolean | null;
  ration_card_type: RationType | null;
  docs_held: string[];
  inferred: string[];
  needs: string[];
  name?: string | null;
  aadhaar_linked_to_bank?: boolean | null;
  receives_other_pension?: boolean | null;
}
export type Status = 'eligible' | 'almost' | 'confirm' | 'not_eligible';
export interface Scheme {
  id: string;
  name: { en: string; hi: string };
  level: 'central' | 'state';
  category: string;
  summary_en: string;
  benefit: {
    kind: 'cover' | 'monthly' | 'yearly' | 'one_time' | 'access';
    amount_inr: number | null;
    label_en: string;
    counts_in_pocket: boolean;
  };
  required_docs: string[];
  how_to_apply_en: string;
  apply_url: string;
  source_url: string;
}
export interface RuleResult { id: string; outcome: 'pass' | 'fail' | 'unknown'; label_en: string }
export interface Result {
  scheme: Scheme;
  status: Status;
  rules: RuleResult[];
  missing_docs: string[];
  unknown_labels: string[];
  failed_labels: string[];
  score: number;
}
export interface Totals { cover: number; monthly: number; yearly: number; one_time: number }
export interface Pocket { eligible: Totals; almost: Totals }
export interface Health {
  ok: boolean; mode: 'live' | 'fixtures'; spend_inr: number; cap_inr: number;
  schemes_version: string; verified_on: string;
}
export interface Persona { id: string; name: string; language_code: string; transcript: string; blurb: string }
export interface Transcribed { transcript: string; language_code: string; duration_s: number }
export interface MatchResponse { results: Result[]; pocket: Pocket; schemes_version: string; verified_on: string }
export interface QuestionPlan { done: boolean; message: string; questions: { id: string; text: string }[]; prompt?: string }
export interface DocResponse {
  doc_type: string;
  confidence: number;
  fields: Record<string, string | number | null>;
  profile_patch: Partial<Profile>;
  docs_held_add: string[];
}
export interface Narration {
  script: string;
  card_text: Record<string, { why: string; next_step: string }>;
  audio_b64: string;
  audio_mime: string;
  tts_language_code: string;
  degraded: boolean;
}

export class ApiError extends Error {
  code: string;
  retryable: boolean;
  aborted: boolean;
  constructor(message: string, code = 'unknown', retryable = true, aborted = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.aborted = aborted;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('Cancelled', 'aborted', false, true);
    throw new ApiError('Cannot reach the server. Check your connection.', 'network', true);
  }
  if (!res.ok) {
    let msg = `Server error (${res.status})`;
    let code = 'http_' + res.status;
    let retryable = res.status >= 500;
    try {
      const j = await res.json();
      if (j?.error) {
        msg = j.error.message ?? msg;
        code = j.error.code ?? code;
        retryable = j.error.retryable ?? retryable;
      }
    } catch { /* ignore */ }
    throw new ApiError(msg, code, retryable);
  }
  try {
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('Cancelled', 'aborted', false, true);
    throw new ApiError('Bad response from server', 'bad_json', true);
  }
}

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  health: (signal?: AbortSignal) => call<Health>('/api/health', { signal }),
  personas: (signal?: AbortSignal) => call<Persona[]>('/api/fixtures/personas', { signal }),
  transcribe: (wav: Blob, languageHint: string | null, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('audio', wav, 'audio.wav');
    if (languageHint) fd.append('language_hint', languageHint);
    return call<Transcribed>('/api/transcribe', { method: 'POST', body: fd, signal });
  },
  profile: (transcript: string, language_code: string, signal?: AbortSignal) =>
    call<{ profile: Profile; notes: string[]; language_code?: string }>('/api/profile', json({ transcript, language_code }, signal)),
  report: async (profile: Profile, results: Result[], filter: 'eligible' | 'all'): Promise<Blob> => {
    const response = await fetch('/api/report.pdf', json({ profile, results, filter }));
    if (!response.ok) {
      let message = 'Could not create the PDF. Please try again.';
      try { const payload = await response.json(); message = payload?.error?.message ?? message; } catch { /* non-JSON error */ }
      throw new ApiError(message, 'pdf_error', true);
    }
    return response.blob();
  },
  match: (profile: Profile, docs_held: string[], signal?: AbortSignal) =>
    call<MatchResponse>('/api/match', json({ profile, docs_held }, signal)),
  questions: (profile: Profile, language_code: string, attempts: number, context: string, asked_fields: string[], signal?: AbortSignal) =>
    call<QuestionPlan>('/api/questions', json({ profile, language_code, attempts, context, asked_fields }, signal)),
  speak: async (text: string, language_code: string) => {
    const response = await call<{ audio_b64: string }>('/api/speak', json({ text, language_code }));
    return response.audio_b64;
  },
  document: (image: Blob, language_code: string, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('image', image, 'doc.jpg');
    fd.append('language_code', language_code);
    return call<DocResponse>('/api/document', { method: 'POST', body: fd, signal });
  },
  narrate: (results: Result[], pocket: Pocket, profile: Profile, language_code: string, signal?: AbortSignal) =>
    call<Narration>('/api/narrate', json({ results, pocket, profile, language_code }, signal)),
};
