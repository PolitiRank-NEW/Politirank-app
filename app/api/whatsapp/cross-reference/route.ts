import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { crossReferenceMembers } from '@/lib/whatsapp-utils';

export async function POST(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const body = await req.json();
        const { candidateId } = body;

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const result = await crossReferenceMembers(candidateId);

        return NextResponse.json({
            success: true,
            message: `Cruzamento concluído — IG: ${result.ig.matched}/${result.ig.total} | FB: ${result.fb.matched}/${result.fb.total}.`,
            ...result,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}
