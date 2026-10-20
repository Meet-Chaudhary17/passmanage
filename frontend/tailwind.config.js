/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vault: {
          darkest: '#090d16',
          darker: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          accent: '#38bdf8',
          shareable: '#10b981',
          restricted: '#f59e0b',
          sensitive: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
