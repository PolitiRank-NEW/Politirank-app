import { NextResponse } from 'next/server';
import { metaService } from '@/services/metaService';

export async function GET(request: Request) {
    try {
        const origin = new URL(request.url).origin;
        const url = metaService.getLoginUrl(origin);
        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Erro na rota de login do Facebook:', error);
        return NextResponse.json({ error: 'Falha ao iniciar login com Facebook' }, { status: 500 });
    }
}
