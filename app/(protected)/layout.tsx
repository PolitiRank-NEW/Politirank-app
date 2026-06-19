import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // @ts-ignore
    const userRole = session.user.role;

    return (
        <Shell userRole={userRole}>
            {children}
        </Shell>
    );
}
