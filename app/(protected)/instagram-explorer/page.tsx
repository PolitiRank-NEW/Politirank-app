import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { InstagramExplorer } from '@/components/instagram-explorer/InstagramExplorer';

export default async function InstagramExplorerPage() {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session) {
        redirect('/login');
    }

    if (role !== 'SUPER_ADMIN') {
        redirect('/');
    }

    return <InstagramExplorer />;
}
