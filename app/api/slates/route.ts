import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get('partyId');

    const where = partyId ? { partyId } : {};

    const slates = await prisma.slate.findMany({
        where,
        orderBy: { name: 'asc' },
    });
    return NextResponse.json(slates);
}
