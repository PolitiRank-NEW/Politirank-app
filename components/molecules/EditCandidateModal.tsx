"use client";

import { useState, useEffect } from "react";
// @ts-ignore
import { useFormState } from "react-dom";
import { updateCandidate } from "@/app/lib/actions";
import { Modal } from "./Modal";
import Swal from 'sweetalert2';

interface EditCandidateModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidate: any;
}

export function EditCandidateModal({ isOpen, onClose, candidate }: EditCandidateModalProps) {
    const [state, formAction] = useFormState(updateCandidate, null);

    // Helper to get handle safely
    const getHandle = (platform: string) => {
        if (!candidate?.candidateProfile?.socialProfiles) return "";
        return candidate.candidateProfile.socialProfiles.find((p: any) => p.platform === platform)?.handle || "";
    };
    const getNotes = () => candidate?.candidateProfile?.notes || "";


    useEffect(() => {
        if (state?.success) {
            Swal.fire({
                title: 'Sucesso!',
                text: state.message,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            onClose();
        } else if (state?.message) {
            Swal.fire({
                title: 'Erro!',
                text: state.message,
                icon: 'error',
            });
        }
    }, [state, onClose]);

    if (!candidate) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Candidato">
            <form action={formAction} className="space-y-4">
                <input type="hidden" name="userId" value={candidate.id} />

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome Completo</label>
                    <input
                        name="name"
                        defaultValue={candidate.name}
                        required
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email (Somente Leitura)</label>
                    <input
                        name="email"
                        defaultValue={candidate.email}
                        disabled
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 px-3 py-2 shadow-sm cursor-not-allowed"
                    />
                </div>

                <div className="pt-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Redes Sociais</h3>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex rounded-md shadow-sm">
                            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">
                                Instagram
                            </span>
                            <input
                                type="text"
                                name="instagram"
                                defaultValue={getHandle('INSTAGRAM')}
                                className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            />
                        </div>

                        <div className="flex rounded-md shadow-sm">
                            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">
                                Facebook
                            </span>
                            <input
                                type="text"
                                name="facebook"
                                defaultValue={getHandle('FACEBOOK')}
                                className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            />
                        </div>

                        <div className="flex rounded-md shadow-sm">
                            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">
                                TikTok
                            </span>
                            <input
                                type="text"
                                name="tiktok"
                                defaultValue={getHandle('TIKTOK')}
                                className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notas / Observações</label>
                    <textarea
                        name="notes"
                        rows={3}
                        defaultValue={getNotes()}
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                        type="submit"
                        className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-2 sm:text-sm"
                    >
                        Salvar Alterações
                    </button>
                    <button
                        type="button"
                        className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </Modal>
    );
}
