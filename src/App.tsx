import React, { startTransition, Suspense, useState } from 'react';

import { DerpSmiley, Loading } from './components';
import Footer from './Footer';
import Home from './Home';
import { Page } from './types';

const Projects = React.lazy(() => import('./Projects'));

function App() {
    const [currentPage, setCurrentPage] = useState<Page>('home');

    const handlePageSelect = (page: Page) => {
        startTransition(() => {
            setCurrentPage(page);
        });
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'projects':
                return (
                    <Suspense fallback={<Loading />}>
                        <Projects />
                    </Suspense>
                );
            case 'home':
                return <Home setCurrentPage={handlePageSelect} />;
            default:
                throw Error(`Invalid page: ${currentPage}`);
        }
    };

    return (
        <div className="App">
            {renderPage()}
            <Footer />
            <DerpSmiley />
        </div>
    );
}

export default App;
