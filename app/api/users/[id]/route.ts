import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // @ts-ignore
    const { role: currentUserRole, partyId: currentUserPartyId, slateId: currentUserSlateId } = session.user;

    try {
        const body = await request.json();
        let { email, password, name, role, partyId, slateId } = body;

        // Fetch existing user to validate permissions
        const userToUpdate = await prisma.user.findUnique({ where: { id } });

        if (!userToUpdate) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // --- RBAC Protection ---

        // 1. Target Scope Check: Can I even touch this user?
        if (currentUserRole !== 'SUPER_ADMIN' && currentUserRole !== 'ADMIN') {
            if (currentUserRole === 'DIRIGENTE') {
                if (userToUpdate.partyId !== currentUserPartyId) {
                    return NextResponse.json({ error: 'Forbidden: Can only edit users from your party' }, { status: 403 });
                }
            } else if (currentUserRole === 'LIDER_CHAPA') {
                if (userToUpdate.slateId !== currentUserSlateId) {
                    return NextResponse.json({ error: 'Forbidden: Can only edit users from your slate' }, { status: 403 });
                }
            } else if (currentUserRole === 'CANDIDATO') {
                if (userToUpdate.id !== session.user.id) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            }
        }

        // 2. Field Modification Check: What can I change?
        if (currentUserRole !== 'SUPER_ADMIN') {
            // Non-Super Admins cannot change Role
            if (role && role !== userToUpdate.role) {
                // Allow Admin to change roles of lower users? Yes.
                if (currentUserRole === 'ADMIN' && ['SUPER_ADMIN'].includes(userToUpdate.role)) {
                    return NextResponse.json({ error: 'Forbidden: Admin cannot change Super Admin role' }, { status: 403 });
                }
                // Dirigente cannot change roles? Or maybe define who is Leader?
                // Let's stick to strict: Dirigente creates/edits Candidates/Leaders.
                // If Dirigente tries to promote to Admin -> Fail.
                if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
                    return NextResponse.json({ error: 'Forbidden: Cannot promote to Admin' }, { status: 403 });
                }
            }

            // Only Super Admin/Admin can change Parties/Slates
            if ((partyId || slateId) && currentUserRole !== 'SUPER_ADMIN' && currentUserRole !== 'ADMIN') {
                return NextResponse.json({ error: 'Forbidden: Insufficient permissions to change affiliations' }, { status: 403 });
            }
        }

        // Data Preparation
        const updateData: any = {
            email,
            name,
            role,
            partyId,
            slateId
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        // Cleanup undefined
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        // Vincular a Liderança do WhatsApp se aplicável
        if (body.whatsappLiderancaId && role === 'LIDER_CHAPA') {
            try {
                await prisma.whatsappLideranca.update({
                    where: { id: body.whatsappLiderancaId },
                    data: { userId: updatedUser.id }
                });
            } catch(e) { console.error("Falha ao vincular lideranca ao usuario editado:", e); }
        }

        // Garantir CandidateProfile se for CANDIDATO
        if (updatedUser.role === 'CANDIDATO') {
            try {
                const existing = await prisma.candidateProfile.findUnique({ where: { userId: updatedUser.id } });
                if (!existing) {
                    await prisma.candidateProfile.create({ data: { userId: updatedUser.id } });
                }
            } catch(e) { console.error("Falha ao garantir CandidateProfile na edição:", e); }
        }

        return NextResponse.json(updatedUser);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // @ts-ignore
    const { role: currentUserRole, partyId: currentUserPartyId, slateId: currentUserSlateId } = session.user;

    try {
        const userToDelete = await prisma.user.findUnique({ where: { id } });

        if (!userToDelete) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // --- RBAC Protection for Deletion ---
        if (currentUserRole !== 'SUPER_ADMIN' && currentUserRole !== 'ADMIN') {
            if (currentUserRole === 'DIRIGENTE') {
                if (userToDelete.partyId !== currentUserPartyId) {
                    return NextResponse.json({ error: 'Forbidden: Can only delete users from your party' }, { status: 403 });
                }
            } else if (currentUserRole === 'LIDER_CHAPA') {
                if (userToDelete.slateId !== currentUserSlateId) {
                    return NextResponse.json({ error: 'Forbidden: Can only delete users from your slate' }, { status: 403 });
                }
                if (userToDelete.role === 'LIDER_CHAPA') {
                    return NextResponse.json({ error: 'Forbidden: Cannot delete other leaders' }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Prevent deleting Super Admins if not Super Admin
        if (userToDelete.role === 'SUPER_ADMIN' && currentUserRole !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Forbidden: Cannot delete Super Admin' }, { status: 403 });
        }

        // Prevent self-deletion if needed (optional)
        if (userToDelete.id === session.user.id) {
            return NextResponse.json({ error: 'Forbidden: Cannot delete yourself from here' }, { status: 403 });
        }

        // 1. Desvincular Lideranças do WhatsApp cadastradas em nome deste usuário
        await prisma.whatsappLideranca.updateMany({
            where: { userId: id },
            data: { userId: null }
        });

        // 2. Apagar CandidateProfile e seus Filhos (Cascade Manual no MongoDB)
        const profile = await prisma.candidateProfile.findUnique({ where: { userId: id } });
        if (profile) {
            await prisma.socialProfile.deleteMany({ where: { candidateId: profile.id } });
            await prisma.userInteraction.deleteMany({ where: { candidateId: profile.id } });
            await prisma.whatsappGroup.deleteMany({ where: { candidateId: profile.id } });
            await (prisma.whatsappLideranca.deleteMany as any)({ where: { candidateIds: { has: profile.id } } });
            
            await prisma.candidateProfile.delete({ where: { id: profile.id } });
        }

        // 3. Finalmente, apagar o usuário
        await prisma.user.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'User deleted successfully' });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}
