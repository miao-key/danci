import type { Metadata, Viewport } from 'next';
import './globals.css';

let title = '学英语单词';
let description = '人教版 / 四级核心词汇在线学习，随时随地背单词';

export const metadata: Metadata = {
  title,
  description,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 禁止双击缩放：单词卡片是全屏交互，放大会破坏布局
  maximumScale: 1,
  // 为全面屏的安全区 padding（env(safe-area-inset-bottom)）留出空间
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
