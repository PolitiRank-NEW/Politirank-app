'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { authenticate } from '@/app/lib/actions';
import { useState, useEffect } from 'react';
import { TrendingUp, Lock, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';

export default function LoginPage() {
    const [errorMessage, dispatch] = useFormState(authenticate, undefined);

    useEffect(() => {
        if (errorMessage === 'SUCCESS') {
            window.location.href = '/';
        }
    }, [errorMessage]);

    if (errorMessage === 'SUCCESS') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50 dark:bg-gray-950">
                <div className="p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl text-center border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
                    <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-green-100 text-green-600 rounded-full">
                        <TrendingUp className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Bem-vindo de volta!</h2>
                    <p className="text-gray-500 dark:text-gray-400">Redirecionando para o seu dashboard...</p>
                    <div className="mt-6 flex justify-center">
                        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50 dark:bg-gray-950 p-4">
            {/* Background Pattern */}
            <div className="absolute inset-0 -z-10 h-full w-full bg-white dark:bg-gray-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

            <Card className="w-full max-w-md border-gray-100 dark:border-gray-800 shadow-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-full w-16 h-16 flex items-center justify-center">
                        <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        PolitiRank
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        Entre com suas credenciais para acessar
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={dispatch} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="sr-only">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    placeholder="seu@email.com"
                                    required
                                    className="pl-9 bg-white dark:bg-gray-950"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Senha</Label>
                                <a href="#" className="text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                                    Esqueceu a senha?
                                </a>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="password"
                                    type="password"
                                    name="password"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    className="pl-9 bg-white dark:bg-gray-950"
                                />
                            </div>
                        </div>

                        {errorMessage && errorMessage !== 'SUCCESS' && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center justify-center animate-in slide-in-from-top-2">
                                <p>{errorMessage}</p>
                            </div>
                        )}

                        <LoginButton />
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Não tem uma conta?{' '}
                        <a href="/register" className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 transition-colors">
                            Criar conta
                        </a>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}

function LoginButton() {
    const { pending } = useFormStatus();

    return (
        <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40"
            disabled={pending}
        >
            {pending ? (
                <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    Entrando...
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2">
                    Entrar
                    <ArrowRight className="w-4 h-4" />
                </div>
            )}
        </Button>
    );
}
