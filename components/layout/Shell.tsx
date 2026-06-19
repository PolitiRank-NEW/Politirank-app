"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
    LayoutDashboard,
    Settings,
    Menu,
    X,
    LogOut,
    ChevronRight,
    TrendingUp,
    UserSearch,
    UserCog,
    User,
    Instagram,
    Facebook
} from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/ui/mode-toggle';

interface ShellProps {
    children: React.ReactNode;
    userRole?: string;
    className?: string;
}

export function Shell({ children, userRole, className }: ShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['ALL'] },
        { name: 'Deep Analytics (IG)', href: '/instagram-analytics', icon: TrendingUp, roles: ['ALL'] },
        { name: 'Explorador de Instagram', href: '/instagram-explorer', icon: Instagram, roles: ['SUPER_ADMIN'] },
        { name: 'Explorador de Facebook', href: '/facebook-explorer', icon: Facebook, roles: ['SUPER_ADMIN'] },
        { name: 'Seleção de Candidatos', href: '/candidates', icon: UserSearch, roles: ['SUPER_ADMIN', 'ADMIN', 'DIRIGENTE', 'LIDER_CHAPA'] },
        { name: 'Tabela de Usuários', href: '/users', icon: UserCog, roles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Configurações', href: '/settings', icon: Settings, roles: ['ALL'] },
    ];

    const filteredNav = navigation.filter(item =>
        item.roles.includes('ALL') || (userRole && item.roles.includes(userRole))
    );

    return (
        <div className="min-h-screen bg-background flex flex-col font-sans">
            {/* App Header (Global Topbar) */}
            <header className="sticky top-0 z-40 w-full bg-white dark:bg-gray-950 shadow-sm">
                <div className="flex items-center justify-between h-16 px-4 md:px-6">
                    {/* Left: Hambuger + Logo */}
                    <div className="flex items-center gap-3 md:gap-4">
                        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-gray-600 dark:text-gray-300">
                            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            <span className="sr-only">Toggle menu</span>
                        </Button>

                        <div className="flex items-center gap-2">
                            <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded bg-blue-600/10">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex flex-col -gap-0.5">
                                <Link href="/" className="text-[1.1rem] font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                                    PolitiRank
                                </Link>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium leading-tight">
                                    Candidato
                                </span>
                            </div>
                        </div>

                        {/* Modo Demo Pill */}
                        <div className="hidden sm:flex ml-4 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full items-center">
                            <span className="text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Modo Demo
                            </span>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 sm:gap-4 relative group">
                        <ModeToggle />
                        
                        <div className="relative group/user">
                            <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 transition-colors">
                                <User className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                                <span className="sr-only">Profile</span>
                            </Button>
                            
                            {/* Dropdown User Nav */}
                            <div className="absolute right-0 top-full mt-2 w-56 opacity-0 invisible group-focus-within/user:opacity-100 group-focus-within/user:visible group-hover/user:opacity-100 group-hover/user:visible transition-all duration-200 z-50">
                                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden mt-1">
                                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">Sua Conta</p>
                                        <p className="text-xs text-slate-500 truncate">{userRole?.replace('_', ' ')}</p>
                                    </div>
                                    <div className="p-1.5 flex flex-col gap-0.5">
                                        <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                            <UserCog className="w-4 h-4" /> Meu Perfil
                                        </Link>
                                    </div>
                                    <div className="p-1.5 border-t border-slate-100 dark:border-slate-800">
                                        <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                            <LogOut className="w-4 h-4" /> Sair da Sessão
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 relative overflow-hidden">
                {/* Mobile & Desktop Sidebar Overlay */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-slate-900/50 z-30 transition-opacity backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar Drawer */}
                <aside
                    className={cn(
                        "fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-gray-950 transform transition-transform duration-300 ease-in-out",
                        sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                >
                    <div className="h-full flex flex-col justify-between">
                        {/* Navigation */}
                        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
                            {filteredNav.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setSidebarOpen(false)}
                                        className={cn(
                                            "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                            isActive
                                                ? "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400"
                                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        )}
                                    >
                                        <item.icon className={cn(
                                            "mr-3 h-4 w-4 transition-colors",
                                            isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-500"
                                        )} />
                                        {item.name}
                                        {isActive && <ChevronRight className="ml-auto w-4 h-4 opacity-50" />}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Footer / Logout */}
                        <div className="p-4">
                            <Button
                                variant="ghost"
                                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => signOut({ callbackUrl: '/login' })}
                            >
                                <LogOut className="mr-3 h-4 w-4" />
                                Sair da Conta
                            </Button>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className={cn("flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8 lg:py-6", className)}>
                    {children}
                </main>
            </div>
        </div>
    );
}
