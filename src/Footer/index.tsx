import { EmailLogo, GithubLogo, LinkedInLogo } from '../logos';

import './Footer.css';

function Footer() {
    const renderCommitHash = () => {
        const commitHash = process.env.REACT_APP_GIT_HASH;
        if (commitHash == null) {
            return <div className="hash">7ak3d3v</div>;
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
            <GithubLogo />
            <LinkedInLogo />
            <EmailLogo />
            {renderCommitHash()}
        </footer>
    );
}

export default Footer;
