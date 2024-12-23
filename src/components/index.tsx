import { useEffect, useState } from 'react';

import './components.css';

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
