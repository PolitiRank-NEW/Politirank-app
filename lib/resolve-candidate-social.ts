import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { facebookService } from '@/services/facebookService';
import { cleanInstagramHandle } from '@/lib/instagram-handle';

type SessionUser = { email?: string | null; role?: string };

export function normalizeSocialHandle(platform: SocialPlatform, handle: string): string {
    if (platform === SocialPlatform.INSTAGRAM) {
        return cleanInstagramHandle(handle).toLowerCase();
    }
    return facebookService.cleanHandle(handle).toLowerCase();
}

export async function resolveCandidateSocialProfile(
    sessionUser: SessionUser,
    platform: SocialPlatform,
    viewAsUserId?: string | null,
    socialProfileId?: string | null
) {
    if (!sessionUser.email) return null;

    const callerRole = sessionUser.role;
    const isAdmin = callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN';
    const isImpersonating = isAdmin && !!viewAsUserId;

    const user = isImpersonating
        ? await prisma.user.findUnique({
              where: { id: viewAsUserId! },
              include: {
                  candidateProfile: {
                      include: {
                          socialProfiles: { where: { platform }, orderBy: { lastUpdate: 'desc' } },
                      },
                  },
              },
          })
        : await prisma.user.findUnique({
              where: { email: sessionUser.email },
              include: {
                  candidateProfile: {
                      include: {
                          socialProfiles: { where: { platform }, orderBy: { lastUpdate: 'desc' } },
                      },
                  },
              },
          });

    if (!user?.candidateProfile) return null;

    const profiles = user.candidateProfile.socialProfiles;
    const socialProfile =
        (socialProfileId && profiles.find((p) => p.id === socialProfileId)) || profiles[0];
    if (!socialProfile?.handle) return null;

    return { user, candidateProfile: user.candidateProfile, socialProfile };
}
