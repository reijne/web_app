import './Home.css';

import React, { Suspense, useEffect, useState } from 'react';

import { FaceLogo } from '../logos';
import { Page } from '../types';

import './Home.css';

// Lazy load the background
const Background = React.lazy(() => import('./Background'));

function Home({ setCurrentPage }: { setCurrentPage: (page: Page) => void }) {
    const [loadBackground, setLoadBackground] = useState(false);

    useEffect(() => {
        setLoadBackground(true);
    }, []);

    return (
        <div className="home">
            <div className="main-content">
                <Header />
                <ProjectsButton setCurrentPage={setCurrentPage} />
            </div>
            {/* Background only loads AFTER the timeout */}
            {loadBackground && (
                <Suspense fallback={null}>
                    <Background />
                </Suspense>
            )}
        </div>
    );
}

function Header() {
    return (
        <div className="header">
            <FaceLogo />
            <HeaderText />
        </div>
    );
}

function HeaderText() {
    return (
        <div className="text-container">
            <h1>dev reijne():</h1>
            <div className="personal-description">
                <p>Hello! I'm Youri Reijne, a software developer.</p>
                <p>
                    Welcome to my personal space, where you can find my contact information and some
                    tiny in-browser projects
                </p>
            </div>
        </div>
    );
}

function ProjectsButton({ setCurrentPage }: { setCurrentPage: (page: Page) => void }) {
    return (
        <div className="projects-button-container">
            <button className="projects-button" onClick={() => setCurrentPage('projects')}>
                <code>View Projects</code>
            </button>
        </div>
    );
}

export default Home;
