import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palette — single source of truth for design system
        espresso: '#5B4A3E',
        shadow: '#8A8077',
        oat: '#CBBFAF',
        ivory: '#E8DED4',
        sunlit: '#F6F2EB',
        burgundy: '#6D001A',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-fraunces)', 'Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
export default config;
