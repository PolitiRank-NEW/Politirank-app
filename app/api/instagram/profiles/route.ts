import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveInstagramAnalyticsContext } from '@/lib/instagram-analytics-context';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const ctx = await resolveInstagramAnalyticsContext(session.user, {
            viewAsUserId: searchParams.get('viewAs'),
            socialProfileId: searchParams.get('socialProfileId'),
            igHandle: searchParams.get('igHandle'),
        });

        if (!ctx) {
            return NextResponse.json({ error: 'Nenhum Instagram vinculado.' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            selectedProfileId: ctx.socialProfile.id,
            selectedHandle: ctx.socialProfile.handle,
            profiles: ctx.allInstagramProfiles.map((p) => ({
                id: p.id,
                handle: p.handle,
                followers: p.followers,
                isManual: p.isManual,
                lastUpdate: p.lastUpdate.toISOString(),
            })),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
