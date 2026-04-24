/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        /** Emergency — SOS, critical alerts, active emergencies */
        emergency: '#E53935',
        /** Trust — headers, navigation, dispatcher surfaces */
        trust: '#1565C0',
        /** Resolved, safe states, positive feedback */
        success: '#2E7D32',
        /** Pending, delayed, weak signal */
        warning: '#F9A825',
        neutral: {
          /** Dark mode base */
          dark: '#121212',
          /** Cards on dark */
          card: '#1E1E1E',
        },
        surface: {
          /** Light mode app background */
          light: '#F5F7FA',
        },
        content: {
          /** Primary text (light surfaces) */
          primary: '#212121',
          /** Secondary / muted text */
          secondary: '#616161',
        },
      },
    },
  },
  plugins: [],
};
