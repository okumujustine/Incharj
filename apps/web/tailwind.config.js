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
          primary:  'rgb(var(--color-bg-primary) / <alpha-value>)',
          surface:  'rgb(var(--color-bg-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-elevated) / <alpha-value>)',
          overlay:  'rgb(var(--color-bg-overlay) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          subtle:  'rgb(var(--color-border-subtle) / <alpha-value>)',
          strong:  'rgb(var(--color-border-strong) / <alpha-value>)',
        },
        text: {
          primary:   'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--color-text-muted) / <alpha-value>)',
          disabled:  'rgb(var(--color-text-disabled) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover:   'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        error:   'rgb(var(--color-error) / <alpha-value>)',
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
