import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,js,ts,jsx,tsx}',
    './dev/**/*.{html,js,ts,jsx,tsx}',
    './app.dev.tsx',
  ],
  theme: {
    extend: {
      zIndex: {
        max: 9999,
      },
      // EASE_OUT from src/motion.ts, for CSS transitions (`ease-opencx`).
      transitionTimingFunction: {
        opencx: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      colors: {
        primary: 'hsl(var(--opencx-primary))',
        'primary-foreground': 'hsl(var(--opencx-primary-foreground))',

        foreground: 'hsl(var(--opencx-foreground))',
        background: 'hsl(var(--opencx-background))',

        accent: 'hsl(var(--opencx-accent))',
        'accent-foreground': 'hsl(var(--opencx-accent-foreground))',

        secondary: 'hsl(var(--opencx-secondary))',
        'secondary-foreground': 'hsl(var(--opencx-secondary-foreground))',

        muted: 'hsl(var(--opencx-muted))',
        'muted-foreground': 'hsl(var(--opencx-muted-foreground))',

        destructive: 'hsl(var(--opencx-destructive))',
        'destructive-foreground': 'hsl(var(--opencx-destructive-foreground))',

        input: 'hsl(var(--opencx-input))',
        border: 'hsl(var(--opencx-border))',
        ring: 'hsl(var(--opencx-ring))',
      },
    },
  },
  plugins: [animate, typography],
};
