"use client";

import { useState } from "react";
// @ts-ignore
import { useFormState } from "react-dom";
import { useEffect } from "react";
import Swal from 'sweetalert2';
import { createCandidate } from "@/app/lib/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Instagram, Facebook, Ticket } from "lucide-react";

export function AddCandidateModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [state, formAction] = useFormState(createCandidate, null);

    useEffect(() => {
        if (state?.success) {
            Swal.fire({
                title: 'Sucesso!',
                text: 'Os dados do seu candidato vão ser adicionados em até 24 horas',
                icon: 'success',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#2563eb' // blue-600
            }).then(() => {
                onClose();
            });
        }
    }, [state, onClose]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-gray-200 dark:border-gray-800">
                <DialogHeader>
                    <DialogTitle className="text-gray-900 dark:text-white">Adicionar Candidato</DialogTitle>
                </DialogHeader>

                <form action={formAction} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-gray-700 dark:text-gray-300">
                            Nome Completo
                        </label>
                        <Input
                            name="name"
                            required
                            placeholder="Ex: João da Silva"
                            className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-gray-700 dark:text-gray-300">
                            Email
                        </label>
                        <Input
                            name="email"
                            type="email"
                            required
                            placeholder="joao@exemplo.com"
                            className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                        />
                        <p className="text-[0.8rem] text-gray-500 dark:text-gray-400">
                            Será usado para o login do candidato.
                        </p>
                    </div>

                    <div className="pt-2">
                        <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Redes Sociais (Opcional)</h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-pink-50 dark:bg-pink-900/20 rounded-md border border-pink-100 dark:border-pink-900/30 min-w-[36px] flex items-center justify-center">
                                    <Instagram className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                                </div>
                                <Input
                                    name="instagram"
                                    placeholder="@usuario"
                                    className="flex-1 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-900/30 min-w-[36px] flex items-center justify-center">
                                    <Facebook className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <Input
                                    name="facebook"
                                    placeholder="URL ou Usuário"
                                    className="flex-1 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 min-w-[36px] flex items-center justify-center">
                                    <Ticket className="w-4 h-4 text-gray-800 dark:text-gray-200" />
                                </div>
                                <Input
                                    name="tiktok"
                                    placeholder="@usuario"
                                    className="flex-1 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-gray-700 dark:text-gray-300">
                            Notas / Observações
                        </label>
                        <textarea
                            name="notes"
                            rows={3}
                            className="flex w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-white ring-offset-background placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    {/* @ts-ignore */}
                    {state?.message && (
                        // @ts-ignore
                        <p className="text-red-600 text-sm text-center">{state.message}</p>
                    )}

                    <DialogFooter className="mt-4 gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={onClose} className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700 border-transparent">Salvar Candidato</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
