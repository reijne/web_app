import type { ProjectName } from '../Projects';
import { parseUrl } from './url';

/** Defines the methods to encode a value to string, and parse the string back into what we want. */
interface Coders<T> {
    encode: (value: T) => string;
    decode: (string: string) => T | undefined;
}

class StoredValue<T> {
    constructor(private readonly _key: string, private readonly coders: Coders<T>) {}

    get key(): string {
        return `reijne-com-${this._key}`;
    }

    get(): T | undefined {
        const storedInSession = sessionStorage.getItem(this.key);
        if (storedInSession == null) {
            return undefined;
        }

        return this.coders.decode(storedInSession);
    }

    set(value: T): void {
        const stringified = this.coders.encode(value);
        sessionStorage.setItem(this.key, stringified);
    }

    del() {
        sessionStorage.removeItem(this.key);
    }
}

export const SessionStorage = {
    lastUrl: new StoredValue<URL>('lastUrl', {
        encode: url => url.href,
        decode: (val: string) => parseUrl(val),
    }),
    project: new StoredValue<ProjectName>('project', {
        encode: project => project,
        // TODO: Fix this type casting, should be possible to check if we have a valid project name.
        decode: (val: string) => val as ProjectName,
    }),
    cookies: new StoredValue<boolean>('cookies', {
        encode: boolean => `${boolean}`,
        decode: (val: string) => val === 'true',
    }),
};