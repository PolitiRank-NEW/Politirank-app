import useSWR from 'swr';
import { userService } from '@/services/userService';

export function useUsers() {
    const { data, error, isLoading, mutate } = useSWR('/users', () => userService.getAll());

    return {
        users: data,
        isLoading,
        isError: error,
        mutate,
    };
}
