import { facebookService } from '../services/facebookService';

const handle = process.argv[2] || 'aline.carballoteixeira';
const token = process.env.APIFY_API_TOKEN;
const PAGES_ACTOR = 'apify~facebook-pages-scraper';
const POSTS_ACTOR = 'apify~facebook-posts-scraper';

async function dumpPages() {
    const url = facebookService.pageUrl(handle);
    const res = await fetch(
        `https://api.apify.com/v2/acts/${PAGES_ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startUrls: [{ url }] }),
        }
    );
    const items = await res.json();
    console.log('\n=== PAGES ACTOR === status', res.status);
    console.log(JSON.stringify(items[0], null, 2));
}

async function dumpPostsFirst() {
    const url = facebookService.pageUrl(handle);
    const res = await fetch(
        `https://api.apify.com/v2/acts/${POSTS_ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startUrls: [{ url }], resultsLimit: 3 }),
        }
    );
    const items = await res.json();
    console.log('\n=== POSTS ACTOR (first item keys) === status', res.status);
    const first = items[0];
    if (first) {
        console.log('keys:', Object.keys(first).join(', '));
        const interesting = [
            'pageFollowers',
            'pageLikes',
            'pageName',
            'user',
            'page',
            'owner',
            'likes',
            'followers',
        ];
        for (const k of interesting) {
            if (first[k] !== undefined) console.log(k + ':', JSON.stringify(first[k]));
        }
    }
}

async function main() {
    const info = await facebookService.getPageInfo(handle);
    console.log('getPageInfo:', info);
    await dumpPages();
    await dumpPostsFirst();
}

main().catch(console.error);
