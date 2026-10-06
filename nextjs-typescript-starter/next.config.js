/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Server Action 的 Origin 白名单。
   *
   * Next.js 14 起 Server Action 默认拒绝缺失 / 不匹配 Origin header 的
   * POST 请求（用于防 CSRF），不通过则报 "Connection closed" 500。
   *
   * 开发与局域网测试场景下 host 多种多样（localhost、127.0.0.1、192.168.x.x），
   * 全部加进来以避免误伤。生产部署到 Vercel 域名时也覆盖到。
   *
   * ref: https://github.com/vercel/next.js/discussions/58646
   *      https://github.com/vercel/next.js/discussions/59105
   */
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        'localhost:3111',
        '127.0.0.1:3111',
        // Vercel 自动部署会替换为项目域名
        // 自托管 / 内网部署时按需追加
      ],
    },
  },
};

module.exports = nextConfig;
