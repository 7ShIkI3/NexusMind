/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nexus: {
          50:  '#f0f4ff',
          100: '#dde8ff',
          200: '#c3d4ff',
          300: '#9ab5ff',
          400: '#6b8eff',
          500: '#4361ee',
          600: '#2f49d1',
          700: '#2438aa',
          800: '#1e2f85',
          900: '#1a2763',
          950: '#111640',
        },
        surface: {
          DEFAULT: '#0f1117',
          50: '#1a1d2e',
          100: '#161927',
          150: '#131620',
          200: '#0f1117',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
