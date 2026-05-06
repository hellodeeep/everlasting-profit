/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#1a1225',
          900: '#231832',
          800: '#372348',
          700: '#4a3060',
          600: '#5d3d78',
          500: '#7a5299',
          400: '#9b74b8',
          300: '#c4a3d9',
          200: '#e0cced',
          100: '#f0e5f7',
          50: '#f8f2fb',
        },
        accent: '#e9d5f6',
        cash: { green: '#22c55e', red: '#ef4444' },
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
