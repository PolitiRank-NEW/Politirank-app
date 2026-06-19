'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getCandidatesForDataEntry() {
    try {
        const candidates = await prisma.user.findMany({
            where: {
                role: 'CANDIDATO'
            },
            include: {
                candidateProfile: {
                    include: {
                        socialProfiles: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return candidates;
    } catch (error) {
        console.error('Error fetching candidates:', error);
        return [];
    }
}

export async function bulkUpdateCandidates(candidatesData: any[]) {
    try {
        // Assume candidatesData is an array of objects from CSV
        // Format expected: { name, email, instagram, facebook, tiktok, bio, notes, ...metrics }

        let successCount = 0;
        let errors = [];

        for (const data of candidatesData) {
            if (!data.email) {
                errors.push('Linha sem email ignorada.');
                continue;
            }

            // 1. Find or Create User
            let user = await prisma.user.findUnique({
                where: { email: data.email }
            });

            if (!user) {
                // Determine name. Use CSV name or fallback to email part.
                const name = data.name || data.email.split('@')[0];

                // Create placeholders for password (they should reset it or use magic link)
                // For now, we can set a random password or just leave it null if schema allows, 
                // but schema says password String?. Let's leave it null or generic.
                // It's safer to not set a known password. 

                try {
                    user = await prisma.user.create({
                        data: {
                            email: data.email,
                            name: name,
                            role: 'CANDIDATO',
                            // password: await bcrypt.hash('mudar123', 10) // Optional: default password
                        }
                    });
                } catch (createError) {
                    errors.push(`Erro ao criar usuário ${data.email}: ${createError}`);
                    continue;
                }
            }

            // 2. Prepare Metrics Data
            const metricsData = {
                bio: data.bio !== undefined ? data.bio : undefined,
                notes: data.notes !== undefined ? data.notes : undefined,

                instagramFollowers: data.instagramFollowers ? parseInt(data.instagramFollowers) : undefined,
                instagramMentions: data.instagramMentions ? parseInt(data.instagramMentions) : undefined,
                instagramComments: data.instagramComments ? parseInt(data.instagramComments) : undefined,

                facebookFollowers: data.facebookFollowers ? parseInt(data.facebookFollowers) : undefined,
                facebookMentions: data.facebookMentions ? parseInt(data.facebookMentions) : undefined,
                facebookComments: data.facebookComments ? parseInt(data.facebookComments) : undefined,

                tiktokFollowers: data.tiktokFollowers ? parseInt(data.tiktokFollowers) : undefined,
                tiktokMentions: data.tiktokMentions ? parseInt(data.tiktokMentions) : undefined,
                tiktokComments: data.tiktokComments ? parseInt(data.tiktokComments) : undefined,

                whatsappMessages: data.whatsappMessages ? parseInt(data.whatsappMessages) : undefined,

                lastMetricUpdate: new Date()
            };

            // 3. Upsert Candidate Profile
            let profile = await prisma.candidateProfile.findUnique({
                where: { userId: user.id }
            });

            if (!profile) {
                profile = await prisma.candidateProfile.create({
                    data: {
                        userId: user.id,
                        // Spread metrics but remove undefined to avoid Prisma errors if any
                        // Actually Prisma handles undefined by doing nothing, but for create we need valid types.
                        // We use fallback to 0 or '' for create.
                        bio: metricsData.bio || '',
                        notes: metricsData.notes || '',
                        instagramFollowers: metricsData.instagramFollowers || 0,
                        instagramMentions: metricsData.instagramMentions || 0,
                        instagramComments: metricsData.instagramComments || 0,
                        facebookFollowers: metricsData.facebookFollowers || 0,
                        facebookMentions: metricsData.facebookMentions || 0,
                        facebookComments: metricsData.facebookComments || 0,
                        tiktokFollowers: metricsData.tiktokFollowers || 0,
                        tiktokMentions: metricsData.tiktokMentions || 0,
                        tiktokComments: metricsData.tiktokComments || 0,
                        whatsappMessages: metricsData.whatsappMessages || 0,
                        lastMetricUpdate: new Date()
                    }
                });
            } else {
                await prisma.candidateProfile.update({
                    where: { id: profile.id },
                    data: metricsData
                });
            }

            // 4. Update Socials Handlers
            const upsertSocial = async (platform: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK', handle: string) => {
                if (!handle) return;

                const existing = await prisma.socialProfile.findFirst({
                    where: { candidateId: profile!.id, platform }
                });

                if (existing) {
                    await prisma.socialProfile.update({
                        where: { id: existing.id },
                        data: { handle }
                    });
                } else {
                    await prisma.socialProfile.create({
                        data: { candidateId: profile!.id, platform, handle }
                    });
                }
            };

            if (data.instagram) await upsertSocial('INSTAGRAM', data.instagram);
            if (data.facebook) await upsertSocial('FACEBOOK', data.facebook);
            if (data.tiktok) await upsertSocial('TIKTOK', data.tiktok);

            successCount++;
        }

        revalidatePath('/to-do');
        return { success: true, count: successCount, errors };

    } catch (error) {
        console.error('Bulk Update Error:', error);
        return { success: false, message: 'Erro ao processar atualização em massa.' };
    }
}

export async function deleteCandidate(candidateId: string) {
    try {
        // We delete the USER, which cascades to profile? Check schema.
        // If relations are optional or cascade, it might work.
        // Usually safer to delete profile then user, or use cascade in schema.
        // Assuming user.id is passed.

        // First delete profile manually to be safe if cascade isn't set up
        // Profile is linked to userId.

        // Find user to verify
        const user = await prisma.user.findUnique({
            where: { id: candidateId },
            include: { candidateProfile: { include: { socialProfiles: true } } }
        });

        if (!user) return { success: false, message: "Usuário não encontrado" };

        // Delete social profiles
        if (user.candidateProfile?.socialProfiles) {
            await prisma.socialProfile.deleteMany({
                where: { candidateId: user.candidateProfile.id }
            });
        }

        // Delete candidate profile
        if (user.candidateProfile) {
            await prisma.candidateProfile.delete({
                where: { id: user.candidateProfile.id }
            });
        }

        // Delete User
        await prisma.user.delete({
            where: { id: candidateId }
        });

        revalidatePath('/to-do');
        return { success: true, message: 'Candidato excluído com sucesso.' };
    } catch (error) {
        console.error('Delete Error:', error);
        return { success: false, message: 'Erro ao excluir candidato.' };
    }
}
