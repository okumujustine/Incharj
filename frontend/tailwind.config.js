/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          surface: '#111111',
          elevated: '#1a1a1a',
          overlay: '#222222',
        },
        border: {
          DEFAULT: '#2a2a2a',
          subtle: '#1f1f1f',
          strong: '#3a3a3a',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#a0a0a0',
          muted: '#666666',
          disabled: '#444444',
        },
        accent: {
          DEFAULT: '#4f9cf9',
          hover: '#6badfb',
          muted: '#4f9cf920',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      borderRadius: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
}
