import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './content/**/*.mdx',
    './public/**/*.svg',
  ],
  theme: {
    extend: {
      colors: {
        // 主色：靛蓝，比纯 blue 更沉稳，长时间阅读不刺眼
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      maxWidth: {
        // 移动端优先：所有页面按 375px 设计，桌面端居中显示不拉伸
        app: '28rem', // 448px
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [],
} satisfies Config;
