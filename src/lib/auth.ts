import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // No adapter needed — we use credentials + JWT only (no OAuth or DB sessions)
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log('[auth] Missing email or password');
            return null;
          }

          const emailLower = (credentials.email as string).toLowerCase();
          console.log('[auth] Login attempt for:', emailLower);

          const user = await prisma.user.findUnique({
            where: { email: emailLower },
            include: { company: true },
          });

          if (!user) {
            console.log('[auth] User not found:', emailLower);
            return null;
          }

          console.log('[auth] User found, checking password...');
          const valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );
          if (!valid) {
            console.log('[auth] Invalid password for:', emailLower);
            return null;
          }

          console.log('[auth] Password valid, updating lastLoginAt...');
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          console.log('[auth] Login successful for:', emailLower);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            companyId: user.companyId,
            companyName: user.company.name,
            role: user.role,
          };
        } catch (error) {
          console.error('[auth] Authorize error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.companyId = (user as any).companyId;
        token.role = (user as any).role;
        token.companyName = (user as any).companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.companyId = token.companyId as string;
        session.user.role = token.role as string;
        session.user.companyName = token.companyName as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
