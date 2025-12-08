import React, { useState } from 'react';

import './PeterThe3DPrinter.css';
import peterImage from './peter_employee_of_the_month.png';

// Filament data structure
interface Filament {
    material: string;
    color: string;
    hexColor: string;
    brand?: string;
    weight?: number;
}

// Sample filament data - replace with your actual filaments
const FILAMENTS: Filament[] = [
    { material: 'PLA', color: 'Black', hexColor: '#1a1a1a' },
    { material: 'PLA', color: 'Gray', hexColor: '#8e9089' },
    { material: 'PLA', color: 'Jade White', hexColor: '#ffffff' },
    { material: 'PLA', color: 'Hot Pink', hexColor: '#F5547D' },
    { material: 'PLA', color: 'Red', hexColor: '#c12e1f' },
    { material: 'PLA', color: 'Orange', hexColor: '#ff6a13' },
    { material: 'PLA', color: 'Yellow', hexColor: '#F4EE2A' },
    { material: 'PLA', color: 'Green', hexColor: '#16c344' },
    { material: 'PLA', color: 'Cyan', hexColor: '#0086d6' },
    { material: 'PLA', color: 'Blue', hexColor: '#0a2989' },
    { material: 'PLA Silk', color: 'Silver', hexColor: '#c8c8c8' },
    { material: 'PLA Matte', color: 'Caramel', hexColor: '#ae835b' },
    { material: 'PLA Matte', color: 'Dark Chocolate', hexColor: '#4d3324' },
    { material: 'PETG', color: 'Black', hexColor: '#1a1a1a' },
    { material: 'Translucent', color: 'Light Blue', hexColor: '#61b0ff' },
    { material: 'Translucent', color: 'Clear', hexColor: '#fafafa' },
    {
        material: 'PLA Gradient',
        color: 'Blueberry Bubblegum',
        hexColor: 'linear-gradient(135deg, #ccecf9 30%, #8374db 100%)',
    },
];

interface FilamentCardProps {
    filament: Filament;
}

function FilamentCard({ filament }: FilamentCardProps) {
    // Check if it's a gradient (contains 'gradient') or solid color
    const isGradient = filament.hexColor.includes('gradient');

    return (
        <div className="filament-card border">
            <div
                className="filament-color-circle"
                style={{
                    ...(isGradient
                        ? { backgroundImage: filament.hexColor }
                        : { backgroundColor: filament.hexColor }),
                    border: '2px solid var(--border-color)',
                }}
            >
                <div className={`filament-material-badge`}>{filament.material}</div>
            </div>
            <div className="filament-info">
                <h4 className="filament-color-name m-0">{filament.color}</h4>
            </div>
        </div>
    );
}

const PeterThe3DPrinter: React.FC = () => {
    const [isImageExpanded, setIsImageExpanded] = useState(false);

    return (
        <div className="filament-container">
            <div className="filament-header row grow text-left">
                <div className="column grow justify-between">
                    <h1>Peter the 3D printer</h1>
                    <p className="filament-count">
                        Peter can print with 4 colors at the same time, and has these{' '}
                        {FILAMENTS.length} colors available to you
                    </p>
                </div>
                <img
                    src={peterImage}
                    alt="Peter the 3d printer, Employee of the Month"
                    className="peter-image border"
                    onClick={() => setIsImageExpanded(true)}
                    style={{ cursor: 'pointer' }}
                />
            </div>
            <div className="filament-grid">
                {FILAMENTS.map((filament) => (
                    <FilamentCard
                        key={`${filament.material + filament.color}`}
                        filament={filament}
                    />
                ))}
            </div>

            {isImageExpanded && (
                <div className="image-lightbox" onClick={() => setIsImageExpanded(false)}>
                    <img
                        src={peterImage}
                        alt="Peter the 3d printer, Employee of the Month - Full Size"
                        className="lightbox-image"
                    />
                </div>
            )}
        </div>
    );
};

export default PeterThe3DPrinter;
