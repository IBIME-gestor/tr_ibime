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
        // Paleta "línea de ruta": 6 colores fijos para identificar cada
        // ruta visualmente en toda la app, como líneas de metro — una
        // ruta siempre se ve del mismo color en tablas, badges y mapas.
        route: {
          teal: '#1E9E96',
          violet: '#7C6FE0',
          coral: '#E0714A',
          sky: '#2E86D6',
          olive: '#8C9A2E',
          pink: '#C4548C',
        },
      },
      boxShadow: {
        panel: '0 8px 24px -12px rgba(14, 22, 38, 0.35)',
        ticket: '0 1px 0 rgba(14,22,38,0.04), 0 12px 30px -16px rgba(14,22,38,0.25)',
      },
    },
  },
  plugins: [],
};
