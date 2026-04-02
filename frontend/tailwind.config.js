/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand colors (as per spec: #141230)
        primary: {
          50: '#f0f0f8',
          100: '#e0e0f0',
          200: '#c2c2e1',
          300: '#9999cc',
          400: '#6666b3',
          500: '#141230', // Main nav color
          600: '#121028',
          700: '#0f0d22',
          800: '#0c0a1b',
          900: '#090815',
        },
        // Accent violet for buttons
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6', // Primary button color
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Status colors
        success: {
          50: '#f0fdf4',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50: '#fffbeb',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fef2f2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        // Dark surface scale (50 = darkest bg, 900 = brightest text)
        surface: {
          50:  '#0f172a',  // Page background — deep navy
          100: '#1e293b',  // Card / panel background
          200: '#334155',  // Borders
          300: '#475569',  // Subtle / disabled
          400: '#64748b',  // Placeholder text
          500: '#94a3b8',  // Secondary text
          600: '#cbd5e1',  // Body text muted
          700: '#e2e8f0',  // Body text
          800: '#f1f5f9',  // Headings
          900: '#f8fafc',  // Bright headings
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0,0,0,0.4), 0 10px 20px -2px rgba(0,0,0,0.3)',
        'card': '0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.2)',
        'elevated': '0 20px 60px -10px rgba(0,0,0,0.6)',
        'glow': '0 0 20px rgba(139, 92, 246, 0.4)',
        'glow-sm': '0 0 10px rgba(139, 92, 246, 0.3)',
        'glow-lg': '0 0 40px rgba(139, 92, 246, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}