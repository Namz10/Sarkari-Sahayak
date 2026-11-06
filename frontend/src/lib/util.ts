export interface Lang { code: string; short: string; name: string }
export const LANGS: Lang[] = [
  { code: 'hi-IN', short: 'हिं', name: 'Hindi' },
  { code: 'mr-IN', short: 'मरा', name: 'Marathi' },
  { code: 'ta-IN', short: 'தமி', name: 'Tamil' },
  { code: 'te-IN', short: 'తెలు', name: 'Telugu' },
  { code: 'bn-IN', short: 'বাং', name: 'Bengali' },
  { code: 'gu-IN', short: 'ગુ', name: 'Gujarati' },
  { code: 'kn-IN', short: 'ಕನ್', name: 'Kannada' },
  { code: 'ml-IN', short: 'മല', name: 'Malayalam' },
  { code: 'pa-IN', short: 'ਪੰ', name: 'Punjabi' },
  { code: 'od-IN', short: 'ଓଡ', name: 'Odia' },
  { code: 'en-IN', short: 'EN', name: 'English' },
];

export const STATES: Record<string, string> = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CG: 'Chhattisgarh', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland',
  OD: 'Odisha', OR: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana',
  TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', UT: 'Uttarakhand', WB: 'West Bengal', DL: 'Delhi',
  JK: 'Jammu & Kashmir', LA: 'Ladakh', CH: 'Chandigarh', PY: 'Puducherry',
};
export const STATE_OPTIONS = Object.entries(STATES).filter(([c]) => c !== 'OR' && c !== 'UT');

export const OCCUPATIONS: Record<string, string> = {
  gig_driver: 'Gig driver', farmer: 'Farmer', construction_worker: 'Construction worker',
  domestic_worker: 'Domestic worker', street_vendor: 'Street vendor', small_shopkeeper: 'Small shopkeeper',
  salaried_formal: 'Salaried (formal)', homemaker: 'Homemaker', student: 'Student', retired: 'Retired',
  unemployed: 'Unemployed', other: 'Other',
};

export const DOCS: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN card', bank_passbook: 'Bank passbook', ration_card: 'Ration card',
  income_certificate: 'Income certificate', domicile_certificate: 'Domicile certificate', age_proof: 'Age proof',
  land_record: 'Land record', mgnrega_job_card: 'MGNREGA job card', caste_certificate: 'Caste certificate',
  mcp_card: 'Mother-child protection card', voter_id: 'Voter ID', unknown: 'Document',
};
export const docLabel = (id: string) => DOCS[id] ?? id.replace(/_/g, ' ');

export function inr(n: number): string {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} lakh`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function maskValue(key: string, v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  const digits = s.replace(/\s/g, '');
  if (/aadhaar|uid/i.test(key) || /^\d{12}$/.test(digits)) {
    return digits.length >= 4 ? `XXXX XXXX ${digits.slice(-4)}` : s;
  }
  return s;
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function b64ToUrl(b64: string, mime: string): string {
  return `data:${mime || 'audio/wav'};base64,${b64}`;
}
