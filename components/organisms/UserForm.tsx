'use client';

import React, { useEffect, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Button } from '@/components/atoms/Button';
import { optionService } from '@/services/optionService';
import { userService } from '@/services/userService';
import { useRouter } from 'next/navigation';

import { UserWithRelations } from '@/services/userService';

interface UserFormProps {
    initialData?: UserWithRelations;
    onSuccess: () => void;
    onCancel: () => void;
}

export const UserForm: React.FC<UserFormProps> = ({ initialData, onSuccess, onCancel }) => {
    const [loading, setLoading] = useState(false);
    const [parties, setParties] = useState<{ value: string; label: string }[]>([]);
    const [slates, setSlates] = useState<{ value: string; label: string }[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: '',
        partyId: '',
        slateId: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                email: initialData.email || '',
                password: '', // Password optional on edit
                role: initialData.role,
                partyId: initialData.partyId || '',
                slateId: initialData.slateId || '',
            });
        }
    }, [initialData]);

    useEffect(() => {
        optionService.getParties().then(data => {
            setParties(data.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` })));
        });
    }, []);

    useEffect(() => {
        // Load slates if party is selected (either from initial or user selection)
        const currentPartyId = formData.partyId || (initialData?.partyId);
        if (currentPartyId) {
            optionService.getSlates(currentPartyId).then(data => {
                setSlates(data.map(s => ({ value: s.id, label: s.name })));
            });
        } else {
            setSlates([]);
        }
    }, [formData.partyId, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const submissionData = {
                ...formData,
                partyId: formData.partyId || undefined,
                slateId: formData.slateId || undefined,
            };

            if (initialData) {
                await userService.update(initialData.id, submissionData);
            } else {
                await userService.create(submissionData);
            }
            onSuccess();
        } catch (error) {
            alert('Erro ao salvar usuário');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Input label="Nome Completo" name="name" value={formData.name} onChange={handleChange} required />
            <Input label="Email" type="email" name="email" value={formData.email} onChange={handleChange} required />
            <Input
                label={initialData ? "Nova Senha (Opcional)" : "Senha"}
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!initialData}
            />

            <Select
                label="Nível de Acesso"
                name="role"
                value={formData.role}
                onChange={handleChange}
                options={[
                    { value: 'SUPER_ADMIN', label: 'Super Admin' },
                    { value: 'ADMIN', label: 'Admin (Secretária)' },
                    { value: 'DIRIGENTE', label: 'Dirigente Partidário' },
                    { value: 'LIDER_CHAPA', label: 'Líder de Chapa' },
                    { value: 'CANDIDATO', label: 'Candidato' },
                ]}
                required
            />

            {/* Permission Alert */}
            {['DIRIGENTE', 'LIDER_CHAPA'].includes(formData.role) && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <p className="text-sm text-blue-700">
                                {formData.role === 'DIRIGENTE'
                                    ? 'Dirigentes podem gerenciar todos os candidatos do seu Partido.'
                                    : 'Líderes de Chapa gerenciam apenas candidatos da sua Chapa.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {['DIRIGENTE', 'LIDER_CHAPA', 'CANDIDATO'].includes(formData.role) && (
                <Select
                    label="Partido"
                    name="partyId"
                    value={formData.partyId}
                    onChange={handleChange}
                    options={parties}
                    required={['DIRIGENTE', 'LIDER_CHAPA'].includes(formData.role)}
                />
            )}

            {['LIDER_CHAPA', 'CANDIDATO'].includes(formData.role) && (
                <Select
                    label="Chapa"
                    name="slateId"
                    value={formData.slateId}
                    onChange={handleChange}
                    options={slates}
                />
            )}

            <div className="flex justify-end pt-4 border-t">
                <Button type="button" variant="secondary" className="mr-3" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" disabled={loading}>
                    {loading ? 'Salvando...' : (initialData ? 'Atualizar Dados' : 'Criar Usuário')}
                </Button>
            </div>
        </form>
    );
};
