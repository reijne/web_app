import React, { Suspense, useEffect, useRef, useState } from 'react';

import { faDoorOpen } from '@fortawesome/free-solid-svg-icons/faDoorOpen';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { CookieConsent, DerpSmiley } from '../components';
import { FaceLogo } from '../logos';

import './Home.css';

const Background = React.lazy(() => import('./Background'));

function useOnScreen<T extends Element>(rootMargin = '0px') {
    const ref = useRef<T | null>(null);
    const [isIntersecting, setIntersecting] = useState(true);

    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }

        const obs = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
            root: null,
            rootMargin,
            threshold: 0.01,
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, [rootMargin]);

    return { ref, isIntersecting };
}

function Home({ navigate }: { navigate: (destination: string) => void }) {
    const [loadBackground, setLoadBackground] = useState(false);
    useEffect(() => {
        setLoadBackground(true);
    }, []);

    return (
        <div className="home auto">
            <div className="main-content">
                <Header />
                <ProjectsSection navigate={navigate} />
            </div>

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
                <p>Hello, I'm Youri Reijne,</p>
                <p>
                    Welcome to my personal space! Feel free to look around, click on some fun links
                    and check out my in-browser projects
                </p>
            </div>
        </div>
    );
}

function ProjectsSection({ navigate }: { navigate: (destination: string) => void }) {
    // Track visibility of the button
    const { ref, isIntersecting } = useOnScreen<HTMLDivElement>('0px');

    const getButton = (floating: boolean) => (
        <button
            className={`purple ${floating ? 'projects-fab' : 'projects-button'}`}
            onClick={() => navigate('/projects')}
        >
            <FontAwesomeIcon className="icon" icon={faDoorOpen} />
            <code>View {`<Projects />`}</code>
        </button>
    );
    return (
        <>
            <div className="projects-button-container" ref={ref}>
                {getButton(false)}
            </div>

            {/* Floating FAB appears only when the main button is off-screen */}
            {!isIntersecting && <div className="projects-fab-container">{getButton(true)}</div>}
        </>
    );
}

export default Home;
