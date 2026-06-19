import React from 'react';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { UserWithRelations } from '@/services/userService';

interface UserRowProps {
    user: UserWithRelations;
    onEdit?: (user: UserWithRelations) => void;
}

export const UserRow: React.FC<UserRowProps> = ({ user, onEdit }) => {
    const getRoleColor = (role: string) => {
        switch (role) {
            case 'SUPER_ADMIN': return 'purple';
            case 'ADMIN': return 'purple';
            case 'DIRIGENTE': return 'green';
            default: return 'blue';
        }
    };

    return (
        <tr>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                {user.name}
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{user.email}</td>
            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                <Badge color={getRoleColor(user.role)}>
                    {user.role}
                </Badge>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                {user.party?.code || '-'}
                {user.slate?.name ? ` / ${user.slate.name}` : ''}
            </td>
            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                <Button variant="secondary" size="sm" onClick={() => onEdit?.(user)}>
                    Editar
                </Button>
            </td>
        </tr>
    );
};
