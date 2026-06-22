/** Normaliza @usuario, URL do Instagram ou username puro para só o username. */
export function cleanInstagramHandle(handle: string | null | undefined): string {
    if (!handle) return '';
    const h = handle.trim();

    const urlMatch = h.match(/instagram\.com\/([^/?#]+)/i);
    if (urlMatch) {
        return urlMatch[1].replace(/\/$/, '').trim();
    }

    return h.replace(/^@/, '').trim();
}
