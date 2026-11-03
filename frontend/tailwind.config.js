/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0B10', ink: '#F3F4F8', muted: '#9AA0B4',
        eligible: '#22C55E', almost: '#F59E0B', confirm: '#60A5FA', nope: '#6B7280',
        violet: '#7C5CFF', cyan: '#22D3EE',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Tamil"', '"Noto Sans Telugu"', '"Noto Sans Bengali"', '"Noto Sans Gujarati"', '"Noto Sans Kannada"', '"Noto Sans Malayalam"', '"Noto Sans Gurmukhi"', '"Noto Sans Oriya"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
