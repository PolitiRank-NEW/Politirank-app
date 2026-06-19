import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/app/lib/prisma';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import bcrypt from 'bcryptjs';
import { z } from 'zod';



export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    // adapter: PrismaAdapter(prisma), // Not needed for Credentials/JWT and avoids initialization issues
    providers: [
        Credentials({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                try {
                    const parsedCredentials = z
                        .object({ email: z.string().email(), password: z.string().min(6) })
                        .safeParse(credentials);

                    if (parsedCredentials.success) {
                        const { email, password } = parsedCredentials.data;

                        const user = await prisma.user.findUnique({ where: { email } });

                        if (!user) return null;
                        if (!user.password) return null;

                        const passwordsMatch = await bcrypt.compare(password, user.password);
                        if (passwordsMatch) return user;
                    }
                    return null;
                } catch (error) {
                    console.error('Authorize Error:', error);
                    throw new Error(error instanceof Error ? error.message : String(error));
                }
            },
        }),
    ],
    session: { strategy: 'jwt' }, // Using JWT strategy for credentials support
});
