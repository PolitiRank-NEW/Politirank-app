'use client';

import { useState } from 'react';
import { X, CheckCircle2, Sparkles, Heart, MessageCircle, Users, FileImage, TrendingUp, TrendingDown } from 'lucide-react';

export interface SyncStats {
  syncedPosts: number;
  newPosts: number;
  updatedPosts: number;
  newPostIds: string[];
  syncedComments: number;
  followersChange: number;
  likesChange: number;
  commentsChange: number;
}

interface SyncResultCardProps {
  stats: SyncStats;
  syncedAt: Date;
  onClose: () => void;
  onShowNewPosts?: () => void;
}

function DiffBadge({ value, label, icon: Icon, positiveColor = 'emerald' }: {
  value: number;
  label: string;
  icon: React.ElementType;
  positiveColor?: 'emerald' | 'blue' | 'pink';
}) {
  const colorMap = {
    emerald: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    blue: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    pink: 'text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
  };

  if (value === 0) return null;

  const isPositive = value > 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${colorMap[positiveColor]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="whitespace-nowrap">
        {isPositive ? '+' : ''}{value.toLocaleString('pt-BR')} {label}
      </span>
      {isPositive ? (
        <TrendingUp className="w-3.5 h-3.5 opacity-70" />
      ) : (
        <TrendingDown className="w-3.5 h-3.5 opacity-70" />
      )}
    </div>
  );
}

export function SyncResultCard({ stats, syncedAt, onClose, onShowNewPosts }: SyncResultCardProps) {
  const hasChanges =
    stats.newPosts > 0 ||
    stats.followersChange !== 0 ||
    stats.likesChange !== 0 ||
    stats.commentsChange !== 0;

  const syncTime = syncedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 shadow-sm overflow-hidden">
      {/* Shimmer accent */}
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-l-2xl" />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
            Sincronização concluída
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">
            {syncTime} · {stats.syncedPosts} posts verificados
          </p>
        </div>
      </div>

      {hasChanges ? (
        <div className="flex flex-wrap gap-2">
          {stats.newPosts > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{stats.newPosts} {stats.newPosts === 1 ? 'post novo' : 'posts novos'}</span>
            </div>
          )}
          <DiffBadge value={stats.followersChange} label="seguidores" icon={Users} positiveColor="emerald" />
          <DiffBadge value={stats.likesChange} label="curtidas" icon={Heart} positiveColor="pink" />
          <DiffBadge value={stats.commentsChange} label="comentários" icon={MessageCircle} positiveColor="blue" />
        </div>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          Nenhuma alteração detectada. Todos os dados já estão atualizados.
        </p>
      )}

      {stats.newPosts > 0 && onShowNewPosts && (
        <button
          onClick={onShowNewPosts}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 underline underline-offset-2 transition-colors"
        >
          <FileImage className="w-3.5 h-3.5" />
          Ver {stats.newPosts === 1 ? 'post novo' : 'posts novos'} ↓
        </button>
      )}
    </div>
  );
}
