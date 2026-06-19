import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
    try {
        const posts = await prisma.mediaPost.findMany({ select: { id: true, socialProfileId: true } });
        const users = await prisma.user.findMany({
            include: { candidateProfile: { include: { socialProfiles: true } } }
        });

        return NextResponse.json({
            success: true,
            posts: posts.slice(0, 3), // just the first 3
            userProfiles: users.map(u => ({
                email: u.email,
                socialProfileIds: u.candidateProfile?.socialProfiles.map(s => s.id)
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
