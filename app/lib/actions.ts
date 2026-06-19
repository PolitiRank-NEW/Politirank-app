'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod'; // Ensure zod is imported if not already

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
): Promise<string | undefined> {
    try {
        await signIn('credentials', {
            email: formData.get('email'),
            password: formData.get('password'),
            redirect: false,
        });
        return 'SUCCESS';
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Credenciais inválidas.';
                default:
                    return 'Erro ao tentar entrar. Tente novamente.';
            }
        }
        // CRITICAL FIX: Rethrow non-AuthErrors (like NEXT_REDIRECT)
        // throw error; // No longer needed as we use redirect: false
        return 'Erro inesperado. Tente novamente mais tarde.';
    }
}

// Schema for validation
const CreateCandidateSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    tiktok: z.string().optional(),
    notes: z.string().optional(),
});

export async function createCandidate(prevState: any, formData: FormData) {
    try {
        const rawData = {
            name: formData.get('name'),
            email: formData.get('email'),
            instagram: formData.get('instagram'),
            facebook: formData.get('facebook'),
            tiktok: formData.get('tiktok'),
            notes: formData.get('notes'),
        };

        const validatedFields = CreateCandidateSchema.safeParse(rawData);

        if (!validatedFields.success) {
            return { message: 'Dados inválidos. Verifique os campos.', success: false };
        }

        const { name, email, instagram, facebook, tiktok, notes } = validatedFields.data;

        // Check for existing user
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return { message: 'Este email já está cadastrado no sistema.', success: false };
        }

        const hashedPassword = await bcrypt.hash('Mudar123!', 10);

        // Transaction to create everything
        await prisma.$transaction(async (tx) => {
            // 1. Create User
            const newUser = await tx.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    role: 'CANDIDATO',
                    // TODO: Assign partyId/slateId from the logged-in user (Dirigente)
                },
            });

            // 2. Create Candidate Profile
            const newProfile = await tx.candidateProfile.create({
                data: {
                    userId: newUser.id,
                    notes: notes || '',
                },
            });

            // 3. Create Social Profiles if handles exist
            const socialProfilesToCreate = [];

            if (instagram) {
                socialProfilesToCreate.push({
                    candidateId: newProfile.id,
                    platform: 'INSTAGRAM' as const,
                    handle: instagram,
                });
            }
            if (facebook) {
                socialProfilesToCreate.push({
                    candidateId: newProfile.id,
                    platform: 'FACEBOOK' as const,
                    handle: facebook,
                });
            }
            if (tiktok) {
                socialProfilesToCreate.push({
                    candidateId: newProfile.id,
                    platform: 'TIKTOK' as const,
                    handle: tiktok,
                });
            }

            if (socialProfilesToCreate.length > 0) {
                await tx.socialProfile.createMany({
                    data: socialProfilesToCreate,
                });
            }
        });

        revalidatePath('/candidates');
        return { message: 'Candidato criado com sucesso!', success: true };

    } catch (error) {
        console.error('Server Action Error:', error);
        return { message: 'Erro ao criar candidato. Tente novamente.', success: false };
    }
}

export async function updateCandidate(prevState: any, formData: FormData) {
    try {
        const userId = formData.get('userId') as string;
        if (!userId) return { message: 'ID do usuário não fornecido.' };

        const rawData = {
            name: formData.get('name'),
            // Email is usually not editable easily due to uniqueness, skipping for simple update for now or handle carefully
            instagram: formData.get('instagram'),
            facebook: formData.get('facebook'),
            tiktok: formData.get('tiktok'),
            notes: formData.get('notes'),
        };

        // Basic validation
        if (!rawData.name) return { message: 'Nome é obrigatório.' };

        await prisma.$transaction(async (tx) => {
            // 1. Update User Name
            await tx.user.update({
                where: { id: userId },
                data: { name: rawData.name as string }
            });

            // 2. Find or Create Profile
            let profile = await tx.candidateProfile.findUnique({ where: { userId } });
            if (!profile) {
                profile = await tx.candidateProfile.create({
                    data: { userId, notes: rawData.notes as string || '' }
                });
            } else {
                await tx.candidateProfile.update({
                    where: { id: profile.id },
                    data: { notes: rawData.notes as string || '' }
                });
            }

            // 3. Update Socials (Upsert logic simulation)
            // Helper to upsert social
            const upsertSocial = async (platform: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK', handle: string) => {
                const existing = await tx.socialProfile.findFirst({
                    where: { candidateId: profile!.id, platform }
                });

                if (handle) {
                    if (existing) {
                        await tx.socialProfile.update({
                            where: { id: existing.id },
                            data: { handle }
                        });
                    } else {
                        await tx.socialProfile.create({
                            data: { candidateId: profile!.id, platform, handle }
                        });
                    }
                } else if (existing) {
                    // If handle is empty/removed, delete the record? Or keep empty? 
                    // Let's delete for clean data if user clears input
                    await tx.socialProfile.delete({ where: { id: existing.id } });
                }
            };

            await upsertSocial('INSTAGRAM', rawData.instagram as string);
            await upsertSocial('FACEBOOK', rawData.facebook as string);
            await upsertSocial('TIKTOK', rawData.tiktok as string);
        });

        revalidatePath('/candidates');
        return { message: 'Candidato atualizado com sucesso!', success: true };

    } catch (error) {
        console.error('Update Error:', error);
        return { message: 'Erro ao atualizar candidato.', success: false };
    }
}
