import { useEffect, useState } from 'react';

import './components.css';

import { SessionStorage } from '../utils';

export function Loading({ resource = '' }: { resource?: string }) {
    return (
        <div className="loading">
            <div className="icon">⚪</div> Loading{resource}...
        </div>
    );
}

const DERP_SMILEY = {
    flipThreshold: 42,
    squishThreshold: 100,
    wiggleDuration: 1000,
};
export function DerpSmiley() {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isWiggling, setIsWiggling] = useState(false);
    const [isSquished, setIsSquished] = useState(false);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const smiley = document.querySelector('.derp-smiley');
            if (!smiley) return;

            const smileyRect = smiley.getBoundingClientRect();
            const distanceX = Math.abs(event.clientX - smileyRect.left);
            const distanceY = Math.abs(event.clientY - smileyRect.top);

            const isWithinSquishDistance =
                distanceX < DERP_SMILEY.squishThreshold && distanceY < DERP_SMILEY.squishThreshold;

            if (!isWithinSquishDistance) {
                return;
            }

            setIsSquished(isWithinSquishDistance);
            const isWithinFlipDistance =
                distanceX < DERP_SMILEY.flipThreshold && distanceY < DERP_SMILEY.flipThreshold;

            if (isWithinFlipDistance) {
                setIsFlipped(prev => !prev); // Flip to other side
                setIsSquished(false); // Reset squish state
                setIsWiggling(true); // Trigger wiggle effect
                setTimeout(() => setIsWiggling(false), DERP_SMILEY.wiggleDuration);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    const classers = [
        'derp-smiley',
        isFlipped && 'flip',
        isWiggling && 'wiggle',
        isSquished && 'squish',
    ];
    return <div className={classers.join(' ')}>•ᴗ•</div>;
}

export const CookieConsent = () => {
    const [showBanner, setShowBanner] = useState<boolean>(false);
    const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
    const [rememberPage, setRememberPage] = useState<boolean>(
        SessionStorage.cookies.get() ?? false,
    );

    useEffect(() => {
        const consent = SessionStorage.cookies.get();
        // First visit - show banner
        if (consent == null) {
            setShowBanner(true);
        }
    }, []);

    // Handle consent through the banner
    const handleConsent = (agree: boolean) => {
        if (agree) {
            SessionStorage.cookies.set(true);
            setRememberPage(true);
        } else {
            SessionStorage.cookies.set(false);
            setRememberPage(false);
        }
        setShowBanner(false);
    };

    // Toggle from settings
    const toggleRememberPage = () => {
        const newValue = !rememberPage;
        setRememberPage(newValue);
        SessionStorage.cookies.set(newValue);

        // Clear session storage if disabled
        if (!newValue) {
            SessionStorage.page.del();
            SessionStorage.project.del();
            SessionStorage.cookies.del();
        }
    };

    return (
        <div>
            {/* Consent Banner */}
            {showBanner && (
                <div className="cookie-banner">
                    <div>
                        <p>
                            We solely use functional cookies and don't collect any data whatsoever
                        </p>
                    </div>
                    <div className="buttons">
                        <button className="green" onClick={() => handleConsent(true)}>
                            <span style={{ fontSize: '1rem' }}>✓</span> okay
                        </button>
                        <button className="red" onClick={() => handleConsent(false)}>
                            <span style={{ fontSize: '1rem' }}>✗</span> not okay
                        </button>
                    </div>
                </div>
            )}

            {/* Gear Icon for Settings */}
            <button
                className="gear-icon"
                disabled={showBanner}
                onClick={() => setSettingsOpen(!settingsOpen)}
            >
                ⚙️
            </button>

            {/* Settings Modal */}
            {settingsOpen && (
                <div className="settings-modal border">
                    <div className="head">
                        <div className="title">settings</div>
                        <button className="close" onClick={() => setSettingsOpen(false)}>
                            ✗
                        </button>
                    </div>
                    <div className="toggle-container">
                        <label>remember page on reload</label>
                        <input
                            type="checkbox"
                            checked={rememberPage}
                            onChange={toggleRememberPage}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
