import { Page, PAGES } from '../App';
import type { ProjectName } from '../Projects';

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

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
        const storedInSession = window.sessionStorage.getItem(this.key);
        if (storedInSession == null) {
            return undefined;
        }

        return this.coders.decode(storedInSession);
    }

    set(value: T): void {
        const stringified = this.coders.encode(value);
        window.sessionStorage.setItem(this.key, stringified);
    }

    del() {
        window.sessionStorage.removeItem(this.key);
    }
}

export const SessionStorage = {
    page: new StoredValue<Page>('page', {
        encode: page => page,
        decode: (val: string) => {
            if (val in PAGES) {
                return val as Page;
            }
            return undefined;
        },
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
