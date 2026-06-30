/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- BRAND COLORS (REBRANDED TO EMERALD GREEN) ---
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981', // Focus rings
          600: '#059669', // Main buttons, active links
          700: '#047857', // Hover states
          800: '#065f46',
          900: '#064e3b',
        },
        // --- SECONDARY COLORS (Used for dark sidebars & subtle UI) ---
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        
        // --- FEEDBACK COLORS ---
        success: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },

        // --- SEMANTIC LAYOUT COLORS ---
        background: '#f8fafc', // App body background
        surface: '#ffffff',    // Cards, modals, inputs
        border: '#e2e8f0',     // Dividers, borders
        
        text: {
          DEFAULT: '#0f172a',  // Primary text
          muted: '#64748b',    // Secondary text
          inverted: '#ffffff', // White text (on colored buttons)
        },
      },
    },
  },
  plugins: [],
}