import { resolve } from 'node:path';

// LOCAL_CORE dev mode (`make dev-local-core`): app-shell-core resolves to the
// sibling ../schema_forge_core source (see vite.config.js/vitest.config.js),
// so Tailwind must scan THAT source too, or any class introduced only in a
// core-package file (nothing in the published node_modules copy below, nothing
// in this app's own src/) silently never compiles — confirmed live: a
// freshly-added `max-h-[70vh]` on an ImportDialog.jsx step wrapper rendered
// with computed max-height "none" until swapped for an already-scanned value.
const LOCAL_CORE = process.env.LOCAL_CORE === '1';
const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(import.meta.dirname, '../../../schema_forge_core');
const CORE_APP_SHELL_SRC_GLOB = resolve(CORE_REPO, 'packages/app-shell-core/src/**/*.{js,jsx}');

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: [
    './index.html',
    './src/**/*.{js,jsx}',
    '../../artifacts/**/generated/**/*.{js,jsx}',
    // UI components live in the installed @etendosoftware/app-shell-core package
    // and carry classes like `bg-popover` that exist nowhere in this app's own
    // files — without scanning them Tailwind purges those utilities and the
    // popover/calendar surfaces render with a transparent background (ETP-4083).
    // `packages/*` no longer exists locally after the core/functional split —
    // this now scans the installed dependency's source directly.
    '../../node_modules/@etendosoftware/app-shell-core/src/**/*.{js,jsx}',
    // Onboarding/login components live in the installed etendo-go-core package.
    // Scan them too; otherwise Tailwind purges layout and auth-form utilities
    // after the core/functional package split.
    '../../node_modules/@etendosoftware/etendo-go-core/src/**/*.{js,jsx}',
    // LOCAL_CORE only — scan the live sibling source in addition to (not
    // instead of) the published copy above, so classes work under both dev
    // profiles without needing a publish/reinstall cycle.
    ...(LOCAL_CORE ? [CORE_APP_SHELL_SRC_GLOB] : []),
  ],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			'accent-highlight': {
  				DEFAULT: 'hsl(var(--accent-highlight))',
  				foreground: 'hsl(var(--accent-highlight-foreground))'
  			},
  			'page-bg': 'hsl(var(--page-bg))',
  			'text-primary': 'hsl(var(--text-primary))',
  			'search-bg': 'hsl(var(--search-bg))',
  			'topbar-icon': 'hsl(var(--topbar-icon))',
  			'topbar-breadcrumb': 'hsl(var(--topbar-breadcrumb))',
  			'text-secondary': 'hsl(var(--text-secondary))',
  			'search-placeholder': 'hsl(var(--search-placeholder))'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		zIndex: {
  			60: '60',
  			70: '70',
  		}
  	}
  },
  plugins: [],
};
