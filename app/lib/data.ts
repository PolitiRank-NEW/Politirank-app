import { prisma } from '@/app/lib/prisma';
import { unstable_noStore as noStore } from 'next/cache';

export async function fetchCandidates(userRole: string, partyId?: string, slateId?: string) {
    noStore(); // Disable caching for real-time updates

    try {
        let whereClause: any = {
            role: 'CANDIDATO' // We are looking for users who are candidates
        };

        // Filter based on hierarchy
        if (userRole === 'DIRIGENTE' && partyId) {
            whereClause.partyId = partyId;
        } else if (userRole === 'LIDER_CHAPA' && slateId) {
            whereClause.slateId = slateId;
        } else if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
            // Admins see everyone
        } else {
            // Candidates see only themselves (or empty if unauthorized to see list)
            // Ideally candidates shouldn't access the full list page, but just in case:
            return [];
        }

        const candidates = await prisma.user.findMany({
            where: whereClause,
            include: {
                party: true,
                slate: true,
                candidateProfile: {
                    include: {
                        socialProfiles: true // Option B: Include the social profiles
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        return candidates;
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch candidates data.');
    }
}
