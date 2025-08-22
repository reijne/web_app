import { SlimeConfig, SlimeParticle } from '../Projects/Slime';

import { parseUrl } from './url';

/** Defines the methods to encode a value to string, and parse the string back into what we want. */
interface Coders<T> {
    encode: (value: T) => string;
    decode: (string: string) => T | undefined;
}

class StoredValue<T> {
    constructor(
        private readonly _key: string,
        private readonly coders: Coders<T>
    ) {}

    get key(): string {
        return `reijne-com-${this._key}`;
    }

    get(): T | undefined {
        // eslint-disable-next-line
        const storedInSession = sessionStorage.getItem(this.key);
        if (storedInSession == null) {
            return undefined;
        }

        return this.coders.decode(storedInSession);
    }

    set(value: T): void {
        const stringified = this.coders.encode(value);
        // eslint-disable-next-line
        sessionStorage.setItem(this.key, stringified);
    }

    del() {
        // eslint-disable-next-line
        sessionStorage.removeItem(this.key);
    }
}

export const SessionStorage = {
    lastUrl: new StoredValue<URL>('lastUrl', {
        encode: (url) => url.href,
        decode: (val: string) => parseUrl(val),
    }),
    cookies: new StoredValue<boolean>('cookies', {
        encode: (boolean) => `${boolean}`,
        decode: (val: string) => val === 'true',
    }),
    slimeConfig: new StoredValue<SlimeConfig>('slimeConfig', {
        encode: (config) => JSON.stringify(config),
        // TODO: Add validation of default vals, min and max.
        decode: (val: string) => JSON.parse(val),
    }),
};
