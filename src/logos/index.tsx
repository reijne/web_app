import email from './email.svg';
import faceLogo from './faceLogo.svg';
import github from './github.svg';
import linkedIn from './linkedIn.svg';

import './logos.css';

interface SmileyCombo {
    left: string;
    right: string;
}

const WAVE = '👋';
const THUMBS_UP = '👍';
const ROCK_HAND = '🤘';
const POINT = '🫵';

// const SMILEYS = [ , , , '', '', ''];
const SMILEYS: SmileyCombo[] = [
    { left: WAVE, right: '😄' },
    { left: '😉', right: THUMBS_UP },
    { left: WAVE, right: '😶‍🌫️' },
    { left: POINT, right: '🤨' },
    { left: WAVE, right: '😊' },
    { left: WAVE, right: '😁' },
    { left: ROCK_HAND, right: '😜' },
];
// const EXTRA = ['☕', '✌', '✍'];
// ( • ᴗ - )
export function FaceLogo() {
    const renderBlackWhite = Math.random() < 0.5;

    const renderBlackWhiteLogo = () => (
        <div className="face-logo-black-white">
            <div className="unicode">✍</div>
            <img src={faceLogo} className="svg" alt="logo" />
            <div className="unicode">☕</div>
        </div>
    );

    const renderColoredSmiley = () => {
        const randomSmiley = SMILEYS[Math.floor(Math.random() * SMILEYS.length)];
        return (
            <div className="face-logo-color">
                <div className="unicode">{randomSmiley.left}</div>
                <div className="unicode">{randomSmiley.right}</div>
            </div>
        );
    };

    return (
        <div className="face-logo-wrapper">
            {renderBlackWhite ? renderBlackWhiteLogo() : renderColoredSmiley()}
        </div>
    );
}

export function GithubLogo() {
    return (
        <a
            href="https://github.com/reijne"
            target="_blank"
            rel="noopener noreferrer"
            className="social-link"
        >
            <img src={github} alt="GitHub" className="social-logo" />
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
            <img src={linkedIn} alt="LinkedIn" className="social-logo" />
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
            <img src={email} alt="Email" className="social-logo" />
            <span>y.reijne@gmail.com</span>
        </a>
    );
}
