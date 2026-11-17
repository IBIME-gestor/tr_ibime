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
          50: '#eef2f5',   // superficie hundida / hover de filas
          100: '#dce3e8',  // bordes
          200: '#c9d3db',  // bordes fuertes
          300: '#a9c0ce',  // texto tenue sobre fondo oscuro
          400: '#667381',  // texto secundario
          500: '#287ca8',  // enlaces / acento azul
          600: '#175578',
          700: '#12405f',
          800: '#0d304a',
          900: '#0a2236',  // barra superior, encabezados
        },
        // Fondo general de la app
        paper: '#f6f7f9',
        // Acento ámbar (en Servicios IBIME marca lo activo y el foco)
        signal: {
          yellow: '#d89a2b',
          amber: '#b97816',
          light: '#fbf2df',
        },
        go: { DEFAULT: '#25744a', light: '#eaf6ef' },
        stop: { DEFAULT: '#d62d25', light: '#fdeeed' },
        wait: { DEFAULT: '#667381', light: '#eef2f5' },
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
        panel: '0 7px 20px rgba(16, 43, 62, 0.09)',
        ticket: '0 2px 8px rgba(16, 43, 62, 0.05), 0 12px 30px rgba(16, 43, 62, 0.035)',
      },
    },
  },
  plugins: [],
};
