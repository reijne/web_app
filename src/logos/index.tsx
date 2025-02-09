import { faGithub } from '@fortawesome/free-brands-svg-icons/faGithub';
import { faLinkedin } from '@fortawesome/free-brands-svg-icons/faLinkedin';
import { faGrinBeam } from '@fortawesome/free-regular-svg-icons/faGrinBeam';
import { faLaughBeam } from '@fortawesome/free-regular-svg-icons/faLaughBeam';
import { faLaughWink } from '@fortawesome/free-regular-svg-icons/faLaughWink';
import { faSmileBeam } from '@fortawesome/free-regular-svg-icons/faSmileBeam';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons/faEnvelope';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './logos.css';

export function FaceLogo() {
    const icons = [faLaughBeam, faLaughWink, faSmileBeam, faGrinBeam];
    const icon = icons[Math.floor(Math.random() * icons.length)];
    return <FontAwesomeIcon className="face-logo" icon={icon} />;
}

export function GithubLogo() {
    return (
        <a
            href="https://github.com/reijne"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="github profile"
            className="social-link"
        >
            <FontAwesomeIcon className="social-logo" icon={faGithub} />
            <span>reijne</span>
        </a>
    );
}

export function LinkedInLogo() {
    return (
        <a
            href="https://www.linkedin.com/in/youri-reijne/"
            target="_blank"
            rel="noopener noreferrer"
            className="social-link"
        >
            <FontAwesomeIcon className="social-logo" icon={faLinkedin} />
            <span>youri-reijne</span>
        </a>
    );
}

export function EmailLogo() {
    return (
        <a
            href="mailto:y.reijne@gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            className="social-link"
        >
            <FontAwesomeIcon className="social-logo" icon={faEnvelope} />
            <span>y.reijne@gmail.com</span>
        </a>
    );
}
