'use client';

import { Button } from '@/components/ui/button';
import { Instagram } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import Swal from 'sweetalert2';

interface ConnectInstagramButtonProps {
    isConnected: boolean;
    instagramUsername?: string;
}

export function ConnectInstagramButton({ isConnected, instagramUsername }: ConnectInstagramButtonProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (searchParams.get('connect') === 'success') {
            Swal.fire({
                title: 'Sucesso!',
                text: 'Conta do Instagram conectada com sucesso!',
                icon: 'success',
                timer: 3000,
                showConfirmButton: false
            });
            // Clean URL
            router.replace('/');
        }
    }, [searchParams, router]);

    const handleConnect = () => {
        window.location.href = '/api/auth/facebook';
    };

    const handleDisconnect = () => {
        Swal.fire({
            title: 'Desconectar Instagram?',
            text: 'Isso irá interromper a coleta de novos dados. Seus dados antigos serão mantidos.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sim, desconectar',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const res = await fetch('/api/instagram/disconnect', { method: 'POST' });
                    if (res.ok) {
                        Swal.fire('Desconectado!', 'Sua conta não está mais vinculada.', 'success').then(() => {
                            window.location.reload();
                        });
                    } else {
                        Swal.fire('Erro', 'Não foi possível desconectar.', 'error');
                    }
                } catch (err) {
                    Swal.fire('Erro', 'Erro de conexão.', 'error');
                }
            }
        });
    };

    if (isConnected) {
        return (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 w-full bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 px-4 py-3 rounded-xl text-sm font-medium text-green-700 dark:text-green-400">
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-hidden">
                    <Instagram className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">Conectado como <strong>@{instagramUsername}</strong></span>
                </div>
                <div className="flex gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                    <button
                        onClick={handleConnect}
                        className="flex-1 sm:flex-none justify-center text-center text-xs bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-800/60 px-3 py-1.5 rounded-lg transition-colors font-semibold shadow-sm"
                        title="Se faltar dados, clique aqui para atualizar as permissões do Facebook"
                    >
                        Reconectar
                    </button>
                    <button
                        onClick={handleDisconnect}
                        className="flex-1 sm:flex-none justify-center text-center text-xs bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 px-3 py-1.5 rounded-lg transition-colors font-semibold shadow-sm"
                    >
                        Desconectar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Button
            onClick={handleConnect}
            className="flex w-full sm:w-auto items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-md transition-all border-0 rounded-xl h-[44px]"
        >
            <Instagram className="w-4 h-4" />
            <span>Conectar Instagram</span>
        </Button>
    );
}
