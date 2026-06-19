import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parties = await prisma.party.findMany({
        orderBy: { name: 'asc' },
    });
    return NextResponse.json(parties);
}
