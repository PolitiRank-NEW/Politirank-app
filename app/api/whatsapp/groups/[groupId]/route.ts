import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getGroupWithAccess } from '@/lib/whatsapp-utils';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { groupId } = await params;
        // @ts-ignore
        const { group, allowed, reason } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed) return NextResponse.json({ error: reason }, { status: 403 });

        return NextResponse.json({
            success: true,
            group: {
                ...group,
                liderancaName: group.lideranca?.name,
            },
        });
    } catch (error: any) {
        console.error('Error fetching whatsapp group:', error);
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}
