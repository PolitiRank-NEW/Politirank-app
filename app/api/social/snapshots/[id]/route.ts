import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import { SocialPlatform } from '@prisma/client';
import { snapshotToTrackerResponse } from '@/lib/social-snapshots';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const viewAsUserId = searchParams.get('viewAsUserId');

    const snapshot = await prisma.socialSyncSnapshot.findUnique({
        where: { id },
        include: { socialProfile: true },
    });

    if (!snapshot) {
        return NextResponse.json({ error: 'Snapshot não encontrado.' }, { status: 404 });
    }

    const platform =
        snapshot.platform === SocialPlatform.INSTAGRAM
            ? SocialPlatform.INSTAGRAM
            : SocialPlatform.FACEBOOK;

    const resolved = await resolveCandidateSocialProfile(sessionUser, platform, viewAsUserId);
    if (!resolved || resolved.socialProfile.id !== snapshot.socialProfileId) {
        return NextResponse.json({ error: 'Acesso negado a este snapshot.' }, { status: 403 });
    }

    return NextResponse.json(snapshotToTrackerResponse(snapshot));
}
