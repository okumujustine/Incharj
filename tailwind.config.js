/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--c-bg)",
          card: "var(--c-card)",
          "card-solid": "var(--c-card-solid)",
          hover: "var(--c-hover)",
          selected: "var(--c-selected)",
        },
        border: {
          DEFAULT: "var(--c-border)",
          bright: "var(--c-border-bright)",
        },
        tx: {
          DEFAULT: "var(--c-tx)",
          sec: "var(--c-tx-sec)",
          muted: "var(--c-tx-muted)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          light: "rgb(var(--c-accent-light) / <alpha-value>)",
          violet: "#a78bfa",
          text: "var(--c-accent-text)",
        },
        success: "var(--c-success)",
        danger: "var(--c-danger)",
        warning: "var(--c-warning)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "search-focus":
          "0 0 0 1px rgba(139,92,246,0.4), 0 0 40px rgba(139,92,246,0.15)",
        glass: "0 4px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backdropBlur: {
        glass: "20px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(5px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        slide: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.16s ease-out both",
        "spin-slow": "spin-slow 1.2s linear infinite",
        slide: "slide 1.2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      fontFamily: {
        mono: ["SF Mono", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};