import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { FacebookExplorer } from '@/components/facebook-explorer/FacebookExplorer';

export default async function FacebookExplorerPage() {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session) {
        redirect('/login');
    }

    if (role !== 'SUPER_ADMIN') {
        redirect('/');
    }

    return <FacebookExplorer />;
}
