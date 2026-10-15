export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0b0b0d', 800: '#131316', 700: '#1c1c21', 600: '#2a2a31' },
        gold: { 100: '#f8ecd0', 200: '#f1dba5', 300: '#ebca7c', 400: '#e0b25c', 500: '#c99a3e', 600: '#a87d2a', 700: '#85611d' },
        blush: { 50: '#fff1f6', 100: '#ffe0ec', 400: '#f47aa8', 500: '#f0568f', 600: '#d63f77' },
        paper: '#faf7f2',
        line: '#ece5d8'
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,16,8,.04), 0 10px 28px -14px rgba(20,16,8,.14)',
        glow: '0 0 0 1px rgba(201,154,62,.35), 0 12px 32px -12px rgba(201,154,62,.5)',
        pop: '0 18px 50px -12px rgba(11,11,13,.35)'
      }
    }
  },
  plugins: []
}

