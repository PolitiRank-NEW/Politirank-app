import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * Evolution API Webhook Handler
 * Target: messages.upsert
 */
export async function POST(req: NextRequest) {
  try {
    // Security Check: Validate API Key from Evolution
    const apiKey = req.headers.get('apikey');
    const secretKey = process.env.EVOLUTION_API_KEY; // Define this in Vercel/Environment

    if (secretKey && apiKey !== secretKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { event, instance, data } = body;

    // We only care about message upserts (new messages)
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ignored: true });
    }

    const message = data.key || {};
    const remoteJid = message.remoteJid; // This is the Group JID or User JID
    const isGroup = remoteJid?.endsWith('@g.us');

    if (!isGroup) {
      return NextResponse.json({ ignored: 'not a group message' });
    }

    // 1. Find the Candidate associated with this Evolution Instance
    const profile = await (prisma.candidateProfile as any).findFirst({
      where: { evolutionInstanceName: instance }
    });

    if (!profile) {
      console.warn(`[Evolution Webhook] Instance "${instance}" not linked to any candidate.`);
      return NextResponse.json({ error: 'Instance not linked' }, { status: 404 });
    }

    // 2. Find the Specific Group being monitored
    // The 'groupId' field in our DB should match the 'remoteJid' from Evolution
    const group = await prisma.whatsappGroup.findFirst({
      where: { 
        candidateId: profile.id,
        groupId: remoteJid
      },
      include: { lideranca: true }
    });

    if (!group) {
        // Option A: Log and ignore
        // Option B: Auto-create group (for later implementation)
        return NextResponse.json({ ignored: 'group not being monitored' });
    }

    // 3. Increment message counts
    await prisma.$transaction([
        // Update Group
        (prisma.whatsappGroup as any).update({
            where: { id: group.id },
            data: { 
                messagesCount: { increment: 1 },
                lastUpdate: new Date()
            }
        }),
        // Update Lideranca (Aggregated)
        (prisma.whatsappLideranca as any).update({
            where: { id: group.liderancaId },
            data: { 
                messagesCount: { increment: 1 },
                lastUpdate: new Date()
            }
        })
    ]);

    return NextResponse.json({ success: true, group: group.name });
  } catch (error) {
    console.error('[Evolution Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
