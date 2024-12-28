import React, { startTransition, Suspense, useState } from 'react';

import { Loading } from './components';
import Footer from './Footer';
import Home from './Home';
import { SessionStorage } from './utils';

const Projects = React.lazy(() => import('./Projects'));

/** Defines all the pages we have available for App.tsx. */
export const PAGES = ['home', 'projects'] as const;
export type Page = (typeof PAGES)[number];

function App() {
    const [currentPage, setCurrentPage] = useState<Page>(
        // Can use cast here, because we will catch any invalid pages in switch.
        (SessionStorage.page.get() as Page) || 'home',
    );

    const handlePageSelect = (page: Page) => {
        startTransition(() => {
            setCurrentPage(page);
            SessionStorage.page.set(page);
        });
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'projects':
                return (
                    <Suspense fallback={<Loading />}>
                        <Projects handlePageSelect={handlePageSelect} />
                    </Suspense>
                );
            case 'home':
                return <Home handlePageSelect={handlePageSelect} />;
            default:
                return <Home handlePageSelect={handlePageSelect} />;
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
