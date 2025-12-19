/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bauhaus Primary Colors
        'bauhaus-red': {
          DEFAULT: '#E53935',
          dark: '#C62828',
          light: '#EF5350',
        },
        'bauhaus-blue': {
          DEFAULT: '#1E88E5',
          dark: '#1565C0',
          light: '#42A5F5',
        },
        'bauhaus-yellow': {
          DEFAULT: '#FDD835',
          dark: '#F9A825',
          light: '#FFEE58',
        },
        // Neutral Palette
        'bauhaus-black': '#212121',
        'bauhaus-charcoal': '#424242',
        'bauhaus-gray': '#757575',
        'bauhaus-silver': '#BDBDBD',
        'bauhaus-light': '#F5F5F5',
        'bauhaus-white': '#FAFAFA',
        // Terminal Colors
        'terminal': {
          bg: '#0D1117',
          surface: '#161B22',
          border: '#30363D',
          text: '#C9D1D9',
          green: '#7EE787',
          cyan: '#79C0FF',
          orange: '#FFA657',
          red: '#FF7B72',
          purple: '#D2A8FF',
        },
        // Agent Colors
        'agent': {
          claude: '#D97706',
          gemini: '#4285F4',
          codex: '#10A37F',
          qwen: '#6366F1',
          aider: '#EC4899',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
