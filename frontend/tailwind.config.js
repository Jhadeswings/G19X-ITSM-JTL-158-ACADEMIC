/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-soft': 'var(--color-surface-soft)',
        primary: 'var(--color-primary)',
        'primary-soft': 'var(--color-primary-soft)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        border: 'var(--color-border)',
        'brand-deep': 'var(--color-brand-deep)',
        foreground: 'var(--color-text-primary)',
        'muted-foreground': 'var(--color-text-secondary)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
