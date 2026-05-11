/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#372348',
          900: '#4a3060',
          800: '#5d3d78',
          700: '#7a5299',
          600: '#9b74b8',
          500: '#b89ccc',
          400: '#d4c0e2',
          300: '#e9d5f6',
          200: '#f3ebf9',
          100: '#f9f5fc',
          50: '#fcfafd',
        },
        page: '#f8f6f2',
        card: '#ffffff',
        accent: '#372348',
        ev: { primary: '#372348', secondary: '#e9d5f6', light: '#f3ebf9' },
        cash: { green: '#16a34a', red: '#dc2626' },
        txt: { primary: '#1a1328', secondary: '#5a4875', muted: '#8878a0' },
      },
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(55, 35, 72, 0.06), 0 1px 2px rgba(55, 35, 72, 0.04)',
        'card-hover': '0 4px 12px rgba(55, 35, 72, 0.08)',
      },
    },
  },
  plugins: [],
}
