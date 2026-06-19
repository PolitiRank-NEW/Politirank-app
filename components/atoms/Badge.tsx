import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray';
}

export const Badge: React.FC<BadgeProps> = ({ children, color = 'gray' }) => {
    const colors = {
        blue: 'bg-blue-100 text-blue-800',
        green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        purple: 'bg-purple-100 text-purple-800',
        gray: 'bg-gray-100 text-gray-800',
    };

    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]}`}>
            {children}
        </span>
    );
};
