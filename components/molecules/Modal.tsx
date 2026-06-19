'use client';

import React, { ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
            {/* Modal Panel - Simplified Layout */}
            <div
                className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-lg relative flex flex-col max-h-[90vh] text-gray-900 dark:text-gray-100"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white" id="modal-title">
                        {title}
                    </h3>
                    <button
                        type="button"
                        className="text-gray-400 hover:text-gray-500 transition-colors p-2 rounded-full hover:bg-gray-100"
                        onClick={onClose}
                    >
                        <span className="sr-only">Fechar</span>
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content - Scrollable if needed */}
                <div className="px-6 py-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};
