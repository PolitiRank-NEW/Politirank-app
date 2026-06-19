import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-ignore
    const { role, partyId, slateId } = session.user;
    const where: Prisma.UserWhereInput = {};

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        // No filter
    } else if (role === 'DIRIGENTE') {
        if (!partyId) return NextResponse.json({ error: 'Party ID missing' }, { status: 403 });
        where.partyId = partyId;
    } else if (role === 'LIDER_CHAPA') {
        if (!slateId) return NextResponse.json({ error: 'Slate ID missing' }, { status: 403 });
        where.slateId = slateId;
    } else {
        where.id = session.user.id;
    }

    try {
        const users = await prisma.user.findMany({
            where,
            include: { party: true, slate: true, whatsappLiderancas: true },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json(users);
    } catch (error) {
        console.error('DATABASE ERROR:', error); // DEBUG: Show why DB is failing
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-ignore
    const { role: currentUserRole, partyId: currentUserPartyId, slateId: currentUserSlateId } = session.user;

    try {
        const body = await request.json();
        let { email, password, name, role: newRole, partyId, slateId, whatsappLiderancaId } = body;

        // RBAC Enforcement
        if (currentUserRole !== 'SUPER_ADMIN' && currentUserRole !== 'ADMIN') {
            if (currentUserRole === 'DIRIGENTE') {
                if (['SUPER_ADMIN', 'ADMIN', 'DIRIGENTE'].includes(newRole)) {
                    return NextResponse.json({ error: 'Forbidden: Cannot create administrative roles' }, { status: 403 });
                }
                // Force Party ID from current user
                partyId = currentUserPartyId;
            } else if (currentUserRole === 'LIDER_CHAPA') {
                if (newRole !== 'CANDIDATO') {
                    return NextResponse.json({ error: 'Forbidden: Can only create Candidates' }, { status: 403 });
                }
                // Force Party and Slate IDs
                partyId = currentUserPartyId;
                slateId = currentUserSlateId;
            } else {
                return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                role: newRole || 'CANDIDATO',
                partyId: partyId || null,
                slateId: slateId || null,
            },
        });

        // Vincular a Liderança do WhatsApp se aplicável
        if (whatsappLiderancaId && newRole === 'LIDER_CHAPA') {
            try {
                await (prisma.whatsappLideranca.update as any)({
                    where: { id: whatsappLiderancaId },
                    data: { userId: newUser.id }
                });
            } catch(e) { console.error("Falha ao vincular lideranca ao usuario:", e); }
        }

        // Criar CandidateProfile se for CANDIDATO
        if (newRole === 'CANDIDATO') {
            try {
                await prisma.candidateProfile.create({
                    data: { userId: newUser.id }
                });
            } catch(e) { console.error("Falha ao criar CandidateProfile:", e); }
        }

        return NextResponse.json(newUser, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}
