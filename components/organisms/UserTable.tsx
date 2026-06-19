import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserWithRelations } from '@/services/userService';
import { PenSquare } from 'lucide-react';

interface UserTableProps {
    users: UserWithRelations[];
    isLoading?: boolean;
    onEdit: (user: UserWithRelations) => void;
}

export const UserTable: React.FC<UserTableProps> = ({ users, isLoading, onEdit }) => {
    if (isLoading) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
                Carregando usuários...
            </div>
        );
    }

    if (!users || users.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
                Nenhum usuário encontrado.
            </div>
        );
    }

    const getRoleBadgeVariant = (role: string) => {
        // We will misuse 'variant' a bit or better yet, use className for custom colors if Badge doesn't support them all
        // Assuming Badge supports: default, secondary, destructive, outline
        switch (role) {
            case 'SUPER_ADMIN': return 'default'; // Purple/Primary
            case 'ADMIN': return 'secondary';
            case 'DIRIGENTE': return 'outline';
            default: return 'outline';
        }
    };

    const getRoleColorClass = (role: string) => {
        switch (role) {
            case 'SUPER_ADMIN': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
            case 'ADMIN': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
            case 'DIRIGENTE': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
            case 'CANDIDATO': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
            default: return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
        }
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden mt-6">
            <Table>
                <TableHeader className="bg-gray-50/80 dark:bg-gray-800/80">
                    <TableRow className="hover:bg-transparent border-b border-gray-200 dark:border-gray-800">
                        <TableHead className="font-semibold text-gray-700 dark:text-gray-300 pl-6">Usuário</TableHead>
                        <TableHead className="font-semibold text-gray-700 dark:text-gray-300">Cargo</TableHead>
                        <TableHead className="font-semibold text-gray-700 dark:text-gray-300">Partido/Chapa</TableHead>
                        <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300 pr-6">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 transition-colors border-gray-100 dark:border-gray-800">
                            <TableCell className="pl-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                        {getInitials(user.name || '?')}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">{user.name}</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${getRoleColorClass(user.role)}`}>
                                    {user.role}
                                </span>
                            </TableCell>
                            <TableCell className="text-gray-500">
                                {user.party?.code || '-'}
                                {user.slate?.name ? ` / ${user.slate.name}` : ''}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEdit(user)}
                                    className="h-8 w-8 p-0 hover:bg-blue-50 text-blue-600 cursor-pointer"
                                >
                                    <PenSquare className="h-4 w-4" />
                                    <span className="sr-only">Editar</span>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};
