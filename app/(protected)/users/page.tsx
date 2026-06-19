'use client';

import { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { UserTable } from '@/components/organisms/UserTable';
import { Button } from '@/components/atoms/Button';
import { Modal } from '@/components/molecules/Modal';
import { UserForm } from '@/components/organisms/UserForm';
import { UserWithRelations } from '@/services/userService';

export default function UsersPage() {
    const { users, isLoading, isError, mutate } = useUsers();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserWithRelations | undefined>(undefined);

    if (isError) return <div className="p-4 text-red-500">Erro ao carregar usuários.</div>;

    const userList = users || [];

    const handleCreate = () => {
        setSelectedUser(undefined);
        setIsModalOpen(true);
    };

    const handleEdit = (user: UserWithRelations) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setSelectedUser(undefined);
    };

    const handleSuccess = () => {
        mutate(); // Refresh the list
        handleClose();
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Usuários</h1>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                        Gerencie os usuários do sistema.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none cursor-pointer">
                    <Button onClick={handleCreate}>Adicionar Usuário</Button>
                </div>
            </div>

            <UserTable
                users={userList}
                isLoading={isLoading}
                onEdit={handleEdit}
            />

            <Modal
                isOpen={isModalOpen}
                onClose={handleClose}
                title={selectedUser ? 'Editar Usuário' : 'Novo Usuário'}
            >
                <UserForm
                    initialData={selectedUser}
                    onSuccess={handleSuccess}
                    onCancel={handleClose}
                />
            </Modal>
        </div>
    );
}
