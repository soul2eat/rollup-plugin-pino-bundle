import path from 'path';
export const isWindows = typeof process !== 'undefined' && process.platform === 'win32';

const windowsSlashRE = /\\/g;
export function slash(p: string): string {
    return p.replace(windowsSlashRE, '/');
}

export function normalizePath(id: string): string {
    return path.posix.normalize(isWindows ? slash(id) : id);
}
