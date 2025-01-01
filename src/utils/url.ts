import { SessionStorage } from './session';

export const parseUrl = (path: string, base: string = window.location.origin): URL | undefined => {
    console.log('parseURL, path:', path, 'base:', base);
    try {
        const url = new URL(path, base);
        return url;
    } catch (error) {
        return undefined;
    }
};

// On load, check if the user should be redirected
export const handleURLRedirection = () => {
    const currentURL = window.location.pathname;
    const lastURL = SessionStorage.lastUrl.get();

    if (lastURL != null && currentURL === '/') {
        // Prevent redirect loop, clear if explicitly on home page
        sessionStorage.removeItem('last-url');
    }
    // else if (lastURL && currentURL !== lastURL) {
    //     // Redirect to the last URL stored in session
    //     window.location.href = lastURL;
    // }
};
