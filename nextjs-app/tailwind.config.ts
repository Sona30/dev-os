import type { Config } from 'tailwindcss'

/**
 * Every value maps to a token in src/styles/tokens.css (docs/design.md).
 * Spacing uses Tailwind's default 4px scale, which matches the design system's 4px grid
 * (e.g. 24 = 96px page vertical padding, 28 = 112px page horizontal padding).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      canvas: 'var(--bg-canvas)',
      surface: 'var(--bg-surface)',
      subtle: 'var(--bg-subtle)',
      pressed: 'var(--bg-pressed)',
      overlay: 'var(--bg-overlay)',
      text: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        disabled: 'var(--text-disabled)',
        'on-brand': 'var(--text-on-brand)',
      },
      line: {
        DEFAULT: 'var(--border-default)',
        strong: 'var(--border-strong)',
      },
      brand: {
        DEFAULT: 'var(--brand)',
        hover: 'var(--brand-hover)',
        subtle: 'var(--brand-subtle)',
        border: 'var(--brand-border)',
      },
      success: {
        DEFAULT: 'var(--success)',
        bg: 'var(--success-bg)',
        border: 'var(--success-border)',
        text: 'var(--success-text)',
      },
      danger: {
        DEFAULT: 'var(--danger)',
        bg: 'var(--danger-bg)',
        border: 'var(--danger-border)',
        text: 'var(--danger-text)',
      },
      warning: {
        DEFAULT: 'var(--warning)',
        bg: 'var(--warning-bg)',
        border: 'var(--warning-border)',
        text: 'var(--warning-text)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        bg: 'var(--accent-bg)',
        border: 'var(--accent-border)',
        text: 'var(--accent-text)',
      },
    },
    fontFamily: {
      sans: ['var(--font-sans)'],
    },
    // Type scale from docs/design.md: [size, { lineHeight, fontWeight }]; letter-spacing is 0 everywhere
    fontSize: {
      h1: ['48px', { lineHeight: '56px', fontWeight: '700' }],
      h2: ['36px', { lineHeight: '44px', fontWeight: '700' }],
      h3: ['30px', { lineHeight: '38px', fontWeight: '600' }],
      h4: ['28px', { lineHeight: '36px', fontWeight: '600' }],
      h5: ['24px', { lineHeight: '32px', fontWeight: '500' }],
      body: ['16px', { lineHeight: '24px', fontWeight: '500' }],
      caption: ['12px', { lineHeight: '18px', fontWeight: '400' }],
    },
    letterSpacing: { normal: '0' },
    borderRadius: {
      none: '0',
      sm: '4px', // tags, badges
      md: '6px', // buttons, inputs
      lg: '8px', // cards, panels
      xl: '12px', // modals
      full: '9999px', // avatars
    },
    boxShadow: { none: 'none' }, // flat depth: no shadows
    transitionDuration: {
      DEFAULT: '100ms',
      fast: '100ms',
      base: '150ms',
      panel: '200ms',
      page: '250ms',
    },
    transitionTimingFunction: {
      DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)',
      enter: 'cubic-bezier(0, 0, 0.2, 1)',
      exit: 'cubic-bezier(0.4, 0, 1, 1)',
    },
    extend: {
      screens: { xs: '375px' },
    },
  },
  plugins: [],
}

export default config
