import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { metaService } from '@/services/metaService';
import { SocialPlatform } from '@prisma/client';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const origin = url.origin;
    const searchParams = url.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.json({ error: `Facebook Error: ${error}` }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Exchange Code for Short-Lived Token
        const shortToken = await metaService.exchangeCodeForToken(code, origin);

        // 2. Exchange for Long-Lived Token (60 days)
        const { token: longToken, expiresAt } = await metaService.getLongLivedToken(shortToken);

        // 3. Get Instagram Business ID
        const instagramAccount = await metaService.getInstagramBusinessAccount(longToken);

        // 4. Find User and Candidate Profile
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { candidateProfile: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Ensure Candidate Profile exists
        let candidateProfile = user.candidateProfile;
        if (!candidateProfile) {
            // Create a default candidate profile if it doesn't exist
            candidateProfile = await prisma.candidateProfile.create({
                data: {
                    userId: user.id
                }
            });
        }

        // 5. Update or Create SocialProfile
        // We store this under INSTAGRAM platform as it is the primary goal


        // START FIX: Using transaction or findFirst logic because we don't have a unique constraint
        const existingProfile = await prisma.socialProfile.findFirst({
            where: {
                candidateId: candidateProfile.id,
                platform: SocialPlatform.INSTAGRAM
            }
        });

        if (existingProfile) {
            await prisma.socialProfile.update({
                where: { id: existingProfile.id },
                data: {
                    handle: instagramAccount.username,
                    url: `https://instagram.com/${instagramAccount.username}`,
                    instagramBusinessId: instagramAccount.id,
                    accessToken: longToken,
                    tokenExpiresAt: expiresAt,
                    lastUpdate: new Date(),
                }
            });
        } else {
            await prisma.socialProfile.create({
                data: {
                    candidateId: candidateProfile.id,
                    platform: SocialPlatform.INSTAGRAM,
                    handle: instagramAccount.username,
                    url: `https://instagram.com/${instagramAccount.username}`,
                    instagramBusinessId: instagramAccount.id,
                    accessToken: longToken,
                    tokenExpiresAt: expiresAt,
                }
            });
        }

        // Redirect back to dashboard with success message
        return NextResponse.redirect(new URL('/?connect=success', request.url));

    } catch (error: any) {
        console.error('Callback Error:', error.message);
        return NextResponse.json({
            error: 'Erro ao conectar conta.',
            details: error.message
        }, { status: 500 });
    }
}
