/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Paleta "Ruta Segura": azul noche de tablero + amarillo escolar
        navy: {
          50: '#eef1f6',
          100: '#d5dce8',
          400: '#3a527a',
          600: '#22314f',
          700: '#1a2540',
          800: '#152238',
          900: '#0e1626',
        },
        signal: {
          yellow: '#FFC93C',
          amber: '#F2A93B',
        },
        go: {
          DEFAULT: '#2E7D57',
          light: '#E6F4EC',
        },
        stop: {
          DEFAULT: '#C24C3E',
          light: '#FBEAE7',
        },
        wait: {
          DEFAULT: '#8A93A6',
          light: '#EEF0F3',
        },
      },
      boxShadow: {
        panel: '0 8px 24px -12px rgba(14, 22, 38, 0.35)',
      },
    },
  },
  plugins: [],
};
