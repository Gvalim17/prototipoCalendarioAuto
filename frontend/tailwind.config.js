/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#171717',
        primary: {
          DEFAULT: '#000000',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f4f4f5',
          foreground: '#18181b',
        },
        accent: {
          DEFAULT: '#f4f4f5',
          foreground: '#18181b',
        },
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'premium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      }
    },
  },
  plugins: [],
}
