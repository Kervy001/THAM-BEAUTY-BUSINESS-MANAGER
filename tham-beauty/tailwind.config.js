export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#2b1a24', 800: '#35222d', 700: '#432f3a', 600: '#5a4250' },
        gold: { 100: '#f8ecd0', 200: '#f1dba5', 300: '#ebca7c', 400: '#e0b25c', 500: '#c99a3e', 600: '#a87d2a', 700: '#85611d' },
        blush: { 50: '#fff3f7', 100: '#ffe4ee', 200: '#ffcadc', 300: '#fba6c4', 400: '#f47aa8', 500: '#ee5a93', 600: '#d63f77' },
        paper: '#fff9f7',
        line: '#f1e5e1'
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(120,60,70,.04), 0 14px 32px -18px rgba(170,90,110,.28)',
        glow: '0 0 0 1px rgba(201,154,62,.3), 0 12px 30px -12px rgba(224,150,120,.55)',
        rose: '0 10px 24px -10px rgba(238,90,147,.55)',
        pop: '0 18px 50px -12px rgba(43,26,36,.35)'
      }
    }
  },
  plugins: []
}
