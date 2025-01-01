import React, { Suspense, useEffect, useState } from 'react';

import { Loading } from './components';
import Footer from './Footer';
import Home from './Home';
import { isProjectName, ProjectName, toProjectName } from './Projects';
import { parseUrl } from './utils/url';

const Projects = React.lazy(() => import('./Projects'));

/** Defines all the pages we have available for App.tsx. */
export const PAGES = ['home', 'projects'] as const;
export type Page = (typeof PAGES)[number];
export const CURRENT_PAGE = 'home';

interface AppState {
    page: Page;
    selectedProject?: ProjectName;
}

const defaultAppState: AppState = { page: 'home', selectedProject: 'colorWheel' };

function App() {
    const [state, setState] = useState<AppState>(defaultAppState);

    // URL Change Handler
    const handleUrlChange = () => {
        const url = parseUrl(window.location.href);
        if (!url) {
            setState(defaultAppState);
            return;
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'projects') {
            const project = pathParts[1];
            if (isProjectName(project)) {
                setState({
                    page: 'projects',
                    selectedProject: toProjectName(project),
                });
            } else {
                setState({
                    page: 'projects',
                    selectedProject: undefined,
                });
            }
        } else {
            setState({ page: 'home', selectedProject: undefined });
        }
    };

    useEffect(() => {
        handleUrlChange();
        window.addEventListener('popstate', handleUrlChange);
        return () => {
            window.removeEventListener('popstate', handleUrlChange);
        };
    }, []);

    // Navigation with Type Checking
    const navigate = (path: string) => {
        const url = parseUrl(path);
        if (url) {
            window.history.pushState({}, '', url.href);
            handleUrlChange();
        } else {
            window.history.back();
        }
    };

    const renderPage = () => {
        switch (state.page) {
            case 'projects':
                return (
                    <Suspense fallback={<Loading />}>
                        <Projects
                            projectFromUrl={state.selectedProject ?? 'colorWheel'}
                            navigate={navigate}
                        />
                    </Suspense>
                );
            case 'home':
                return <Home navigate={navigate} />;
            default:
                return <Home navigate={navigate} />;
        }
    };

    return (
        <div className="App">
            {renderPage()}
            <Footer />
        </div>
    );
}

export default App;
