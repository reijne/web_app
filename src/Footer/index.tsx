import { EmailLogo, GithubLogo, ItchLogo, LinkedInLogo } from '../logos';

import './Footer.css';

export default function Footer() {
    const renderCommitHash = () => {
        const commitHash = process.env.REACT_APP_GIT_HASH;
        if (commitHash == null) {
            return (
                <div className="hash">
                    <a
                        href={`https://github.com/reijne/web_app/commit/`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        7ak3d3v
                    </a>
                </div>
            );
        } else {
            return (
                <div className="hash">
                    <a
                        href={`https://github.com/reijne/web_app/commit/${commitHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {commitHash}
                    </a>
                </div>
            );
        }
    };

    return (
        <footer className="footer">
            <div className="socials">
                <GithubLogo />
                <ItchLogo />
                <LinkedInLogo />
                <EmailLogo />
            </div>
            {renderCommitHash()}
        </footer>
    );
}
