import { apifyService } from '../services/apifyService';
import { cleanInstagramHandle } from '../lib/instagram-handle';

async function main() {
    const raw = process.argv[2] || 'https://www.instagram.com/alineteixeira.oficial/';
    const clean = cleanInstagramHandle(raw);

    console.log(`Input:  "${raw}"`);
    console.log(`Clean:  "${clean}"`);
    console.log(`\nTestando getProfileInfo(@${clean})...\n`);

    const profile = await apifyService.getProfileInfo(clean);
    if (!profile) {
        console.error('Falhou: getProfileInfo retornou null');
        process.exit(1);
    }

    console.log('Resultado:');
    console.log(`  Seguidores: ${profile.followers?.toLocaleString('pt-BR') ?? 'N/A'}`);
    console.log(`  Posts:      ${profile.postsCount ?? 'N/A'}`);
    console.log(`  Nome:       ${profile.fullName ?? 'N/A'}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
