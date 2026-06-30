import React from 'react';

import './Viver.css';
import paperPdf from './viver-paper.pdf';
import posterPdf from './viver-poster.pdf';

interface ViverDocument {
    title: string;
    src: string;
}

const DOCUMENTS: ViverDocument[] = [
    { title: 'Poster', src: posterPdf },
    { title: 'Paper', src: paperPdf },
];

function PdfViewer({ title, src }: ViverDocument) {
    return (
        <section className="viver-doc">
            <div className="viver-doc-head">
                <h2 className="viver-doc-title m-0">{title}</h2>
                <div className="viver-doc-actions">
                    <a href={src} target="_blank" rel="noopener noreferrer" className="viver-link">
                        Open ↗
                    </a>
                    <a href={src} download className="viver-link">
                        Download
                    </a>
                </div>
            </div>
            <iframe src={src} title={title} className="viver-frame border" />
        </section>
    );
}

const Viver: React.FC = () => {
    return (
        <div className="viver-container">
            <header className="viver-header text-left">
                <h1 className="m-0">
                    Viver: Visual Verification for Trusting Autonomous UI Rewrites
                </h1>
                <p className="viver-subtitle m-0">Giving Claude Code Eyes - CGAI 2026</p>
            </header>
            {DOCUMENTS.map((doc) => (
                <PdfViewer key={doc.title} title={doc.title} src={doc.src} />
            ))}
        </div>
    );
};

export default Viver;
