import { LucideIcon, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/app/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MetricCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    trendUp?: boolean;
    color?: string;
    className?: string;
    isManual?: boolean;
    isAdmin?: boolean;
    tooltip?: string; // Explicação da métrica exibida em hover
}

export function MetricCard({
    label,
    value,
    icon: Icon,
    trend,
    trendUp,
    color = 'blue',
    className,
    isManual,
    isAdmin,
    tooltip,
}: MetricCardProps) {

    const colorMap: Record<string, string> = {
        blue:   'text-blue-500',
        red:    'text-red-500',
        green:  'text-green-500',
        purple: 'text-purple-500',
        orange: 'text-orange-500',
        yellow: 'text-yellow-500',
        gray:   'text-slate-400 dark:text-slate-500 opacity-60 grayscale',
    };

    const iconColorClass = colorMap[color] || colorMap.blue;

    return (
        <Card className={cn('overflow-hidden hover:shadow-md transition-shadow duration-300 rounded-2xl relative', className)}>
            {/* Indicador de Edição Manual (Turk) exibido apenas para Admins */}
            {isManual && isAdmin && (
                <div className="absolute top-3 right-3 z-10">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] cursor-help animate-pulse" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs font-semibold">Fonte de Dados: Inserção Manual</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            <CardContent className="p-5 sm:p-6 flex items-center gap-4 sm:gap-5">
                <div className={cn('shrink-0', iconColorClass)}>
                    <Icon className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={1.5} />
                </div>

                <div className="flex flex-col gap-0.5 min-w-0">
                    {/* Label com tooltip opcional */}
                    <div className="flex items-center gap-1">
                        <p className="text-[13px] sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                            {label}
                        </p>
                        {tooltip && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-help">
                                            <Info className="w-3 h-3" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[240px] text-xs leading-relaxed font-normal">
                                        {tooltip}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>

                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            {value}
                        </h3>
                        {trend && (
                            <span className={cn(
                                'text-xs font-semibold flex items-center',
                                trendUp ? 'text-green-500' : 'text-red-500'
                            )}>
                                {trendUp ? '↗' : '↘'} {trend}
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
