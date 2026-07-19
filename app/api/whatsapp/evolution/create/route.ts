import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { buildInstanceName, evolutionService } from '@/services/evolutionService';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { candidateId } = body as { candidateId?: string };

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const instanceName = access.profile.evolutionInstanceName || buildInstanceName(candidateId);

        let created = false;
        try {
            await evolutionService.createInstance(instanceName);
            created = true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            const axiosData = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data;
            const apiMessage = Array.isArray(axiosData?.message)
                ? axiosData.message.join(', ')
                : axiosData?.message;

            const alreadyExists =
                /already exists|already in use|já existe|duplicate|name.*in use/i.test(
                    `${message} ${apiMessage || ''}`
                );

            if (!alreadyExists) {
                console.error('[Evolution create]', axiosData || message);
                return NextResponse.json(
                    { error: apiMessage || message || 'Falha ao criar instância na Evolution API.' },
                    { status: 502 }
                );
            }
        }

        await prisma.candidateProfile.update({
            where: { id: candidateId },
            data: { evolutionInstanceName: instanceName },
        });

        return NextResponse.json({
            success: true,
            instanceName,
            created,
            webhookUrl: process.env.NEXTAUTH_URL
                ? `${process.env.NEXTAUTH_URL.replace(/\/$/, '')}/api/webhooks/whatsapp/evolution`
                : 'http://localhost:3000/api/webhooks/whatsapp/evolution',
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
