/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        /** Emergency — SOS, critical alerts */
        emergency: '#E53935',
        trust: '#1565C0',
        success: '#2E7D32',
        warning: '#F9A825',
        /** Splash / header navy */
        brand: {
          navy: '#070D18',
          slate: '#0c1526',
          mist: '#94a3b8',
        },
        neutral: {
          dark: '#080e18',
          card: '#111827',
          elevated: '#1e293b',
        },
        surface: {
          light: '#F5F7FA',
        },
        content: {
          primary: '#212121',
          secondary: '#616161',
        },
      },
    },
  },
  plugins: [],
};
