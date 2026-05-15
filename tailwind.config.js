/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mv: {
          bg: '#080d18',
          surface: '#0e1525',
          elevated: '#141c30',
          border: '#1e2d4a',
          teal: '#00d4aa',
          tealDark: '#00b894',
          amber: '#f59e0b',
          red: '#ef4444',
          green: '#22c55e',
          blue: '#3b82f6',
          purple: '#a855f7',
          text: '#e2e8f0',
          muted: '#94a3b8',
          faint: '#64748b'
        }
      }
    }
  },
  plugins: []
};
