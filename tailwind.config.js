/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FAF7F2',
        card: '#FFFFFF',
        ink: '#14110F',
        muted: '#6B645C',
        primary: '#0B6B4F',
        'primary-soft': '#E3F3EC',
        amber: '#F59E0B',
        danger: '#E5484D',
        lime: '#C8F169',
        line: '#EDE8E0',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(20,17,15,0.06)',
        mic: '0 12px 28px rgba(11,107,79,0.4)',
      },
      borderRadius: {
        card: '24px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};
