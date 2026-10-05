import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authenticateUser } from '@/lib/user-repo';
import { authConfig } from 'app/auth.config';

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'email',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize({ email, password }: any) {
        if (typeof email !== 'string' || typeof password !== 'string') {
          return null;
        }
        const user = await authenticateUser(email, password);
        if (!user) return null;
        // 只返回必要字段，passwordHash 绝不进 session
        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
        } as any;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Credentials + JWT 策略下 session.user.id 默认是 undefined，
    // 必须手动把 uid 从 token 透出来（docs/design.md 6.2）。
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});
