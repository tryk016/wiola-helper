/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // EWI brand
        'ewi-green': {
          DEFAULT: '#2D7D46',
          50: '#E8F4EC',
          100: '#C5E2CD',
          500: '#2D7D46',
          700: '#1E5530',
          900: '#10301B',
        },
        'ewi-blue': {
          DEFAULT: '#1E5C8A',
          50: '#E5EEF5',
          500: '#1E5C8A',
          700: '#103D5E',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
