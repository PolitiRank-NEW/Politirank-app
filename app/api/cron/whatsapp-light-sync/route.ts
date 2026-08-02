import { NextRequest, NextResponse } from 'next/server';
import { runLightHourlySyncForAllCandidates } from '@/lib/whatsapp-group-live-sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Sync leve horário: lista grupos + reconcilia entradas/saídas só onde o tamanho mudou.
 * Auth: Authorization: Bearer <CRON_SECRET>  ou  ?secret=
 *
 * Vercel Cron (Pro) ou Contabo crontab (Hobby) — ver docker/evolution/cron-light-sync.sh
 */
function authorize(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const auth = req.headers.get('authorization') || '';
    if (auth === `Bearer ${secret}`) return true;

    const url = new URL(req.url);
    if (url.searchParams.get('secret') === secret) return true;

    // Vercel Cron envia este header em alguns planos
    const vercelCron = req.headers.get('x-vercel-cron');
    if (vercelCron && auth === `Bearer ${secret}`) return true;

    return false;
}

async function run(req: NextRequest) {
    if (!authorize(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
        return NextResponse.json(
            { error: 'EVOLUTION_API_URL / EVOLUTION_API_KEY não configurados.' },
            { status: 500 }
        );
    }

    const started = Date.now();
    const results = await runLightHourlySyncForAllCandidates();
    return NextResponse.json({
        ok: true,
        elapsedMs: Date.now() - started,
        candidates: results.length,
        results,
    });
}

export async function GET(req: NextRequest) {
    return run(req);
}

export async function POST(req: NextRequest) {
    return run(req);
}
