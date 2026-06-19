import api from './api';
import { Party, Slate } from '@prisma/client';

export const optionService = {
    getParties: async () => {
        const response = await api.get<Party[]>('/parties');
        return response.data;
    },
    getSlates: async (partyId?: string) => {
        const params = partyId ? { partyId } : {};
        const response = await api.get<Slate[]>('/slates', { params });
        return response.data;
    }
};
