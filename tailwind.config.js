/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Mismo sistema visual que "Servicios IBIME": tipografía del sistema,
      // sin fuentes externas (carga más rápido y se ve nativa en cada equipo).
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        // Azul marino institucional IBIME (misma escala que Servicios IBIME).
        // Se conserva el nombre "navy" para no tocar las clases existentes.
        navy: {
          50: 'rgb(var(--c-navy-50) / <alpha-value>)',
          100: 'rgb(var(--c-navy-100) / <alpha-value>)',
          200: 'rgb(var(--c-navy-200) / <alpha-value>)',
          300: 'rgb(var(--c-navy-300) / <alpha-value>)',
          400: 'rgb(var(--c-navy-400) / <alpha-value>)',
          500: 'rgb(var(--c-navy-500) / <alpha-value>)',
          600: 'rgb(var(--c-navy-600) / <alpha-value>)',
          700: 'rgb(var(--c-navy-700) / <alpha-value>)',
          800: 'rgb(var(--c-navy-800) / <alpha-value>)',
          900: 'rgb(var(--c-navy-900) / <alpha-value>)',
        },
        paper: '#f6f7f9',
        signal: {
          yellow: 'rgb(var(--c-signal-yellow) / <alpha-value>)',
          amber: 'rgb(var(--c-signal-amber) / <alpha-value>)',
          light: 'rgb(var(--c-signal-light) / <alpha-value>)',
        },
        go: { DEFAULT: 'rgb(var(--c-go) / <alpha-value>)', light: 'rgb(var(--c-go-light) / <alpha-value>)' },
        stop: { DEFAULT: 'rgb(var(--c-stop) / <alpha-value>)', light: 'rgb(var(--c-stop-light) / <alpha-value>)' },
        wait: { DEFAULT: 'rgb(var(--c-wait) / <alpha-value>)', light: 'rgb(var(--c-wait-light) / <alpha-value>)' },
        // Paleta "línea de ruta": 6 colores fijos para identificar cada
        // ruta visualmente en toda la app — no se tocan.
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
        panel: 'var(--shadow-panel)',
        ticket: 'var(--shadow-ticket)',
      },
    },
  },
  plugins: [],
};
