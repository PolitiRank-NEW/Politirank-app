import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label: string;
    error?: string;
    options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, error, options, className = '', ...props }) => {
    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
            <select
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-950 text-gray-900 dark:text-white border-gray-300 dark:border-gray-700 ${error ? 'border-red-500' : ''
                    } ${className}`}
                {...props}
            >
                <option value="" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">Selecione...</option>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                        {opt.label}
                    </option>
                ))}
            </select>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
};
