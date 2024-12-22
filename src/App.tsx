import React, { startTransition, useState } from 'react';

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
                return <Projects />;
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
        </div>
    );
}

export default App;
