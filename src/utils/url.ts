export const parseUrl = (path: string, base: string = window.location.origin): URL | undefined => {
    try {
        const url = new URL(path, base);
        return url;
    } catch (_: unknown) {
        return undefined;
    }
};
