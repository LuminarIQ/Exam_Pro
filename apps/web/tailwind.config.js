/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#1f6feb',
        ink: '#0f172a',
      },
    },
  },
  plugins: [],
};
