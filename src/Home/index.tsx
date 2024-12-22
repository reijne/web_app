import './Home.css';

import { FaceLogo } from '../logos';
import { Page } from '../types';

import './Home.css';

function Home({ setCurrentPage }: { setCurrentPage: (page: Page) => void }) {
    return (
        <div className="Home">
            <div className="Home-main-content">
                <Header />
                <ProjectsButton setCurrentPage={setCurrentPage} />
            </div>
        </div>
    );
}

function Header() {
    return (
        <div className="Home-header">
            <FaceLogo />
            <HeaderText />
        </div>
    );
}

function HeaderText() {
    return (
        <div className="Home-text-container">
            <h1>dev reijne():</h1>
            <div className="Home-personal-description">
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
        <div className="Home-projects-button-container">
            <button className="Home-projects-button" onClick={() => setCurrentPage('projects')}>
                <code>View Projects</code>
            </button>
        </div>
    );
}

export default Home;
