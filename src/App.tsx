import React, { startTransition, Suspense, useState } from 'react';

import { Loading } from './components';
import Footer from './Footer';
import Home from './Home';
import { Page } from './types';
import { SessionStorage } from './utils';

const Projects = React.lazy(() => import('./Projects'));

function App() {
    const [currentPage, setCurrentPage] = useState<Page>(
        // Can use cast here, because we will catch any invalid pages in switch.
        (SessionStorage.getItem('page') as Page) || 'home',
    );

    const handlePageSelect = (page: Page) => {
        startTransition(() => {
            setCurrentPage(page);
            SessionStorage.setItem('page', page);
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
