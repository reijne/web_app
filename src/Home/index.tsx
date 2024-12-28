import './Home.css';

import React, { Suspense, useEffect, useState } from 'react';

import { CookieConsent, DerpSmiley } from '../components';
import { FaceLogo } from '../logos';

import './Home.css';

import { Page } from '../App';

// Lazy load the background
const Background = React.lazy(() => import('./Background'));

function Home({ handlePageSelect }: { handlePageSelect: (page: Page) => void }) {
    const [loadBackground, setLoadBackground] = useState(false);

    useEffect(() => {
        setLoadBackground(true);
    }, []);

    return (
        <div className="home">
            <div className="main-content">
                <Header />
                <ProjectsButton handlePageSelect={handlePageSelect} />
            </div>
            {/* Background only loads AFTER the timeout */}
            {loadBackground && (
                <Suspense fallback={null}>
                    <Background />
                </Suspense>
            )}
            <div className="lower-line">
                <DerpSmiley />
                <CookieConsent />
            </div>
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

function ProjectsButton({ handlePageSelect }: { handlePageSelect: (page: Page) => void }) {
    return (
        <div className="projects-button-container">
            <button className="projects-button" onClick={() => handlePageSelect('projects')}>
                <code>View Projects</code>
            </button>
        </div>
    );
}

export default Home;
