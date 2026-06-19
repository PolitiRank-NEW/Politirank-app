import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnLogin = nextUrl.pathname.startsWith('/login');

            if (isLoggedIn && isOnLogin) {
                return Response.redirect(new URL('/', nextUrl));
            }

            if (!isLoggedIn && !isOnLogin) {
                return false; // Redirect to login
            }

            return true;
        },
        async session({ session, token }) {
            if (token.role && session.user) {
                // @ts-ignore
                session.user.role = token.role;
                // @ts-ignore
                session.user.id = token.id;
                // @ts-ignore
                session.user.partyId = token.partyId;
                // @ts-ignore
                session.user.slateId = token.slateId;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                // @ts-ignore
                token.role = user.role;
                // @ts-ignore
                token.partyId = (user as any).partyId;
                // @ts-ignore
                token.slateId = (user as any).slateId;
            }
            return token;
        },
    },
    providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
