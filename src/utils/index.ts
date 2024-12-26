export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export namespace SessionStorage {
    type key = 'page' | 'project';

    function getAbsoluteKey(key: key): string {
        return `reijne-com-${key}`;
    }

    export function getItem(key: key): string | null {
        return window.sessionStorage.getItem(getAbsoluteKey(key));
    }

    export function setItem(key: key, value: string): void {
        window.sessionStorage.setItem(getAbsoluteKey(key), value);
    }
}
