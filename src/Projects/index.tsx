import React, { Suspense, useEffect, useState } from 'react';

import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBacterium } from '@fortawesome/free-solid-svg-icons/faBacterium';
import { faBars } from '@fortawesome/free-solid-svg-icons/faBars';
import { faBorderAll } from '@fortawesome/free-solid-svg-icons/faBorderAll';
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle';
import { faCube } from '@fortawesome/free-solid-svg-icons/faCube';
import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse';
import { faNewspaper } from '@fortawesome/free-solid-svg-icons/faNewspaper';
import { faTableTennisPaddleBall } from '@fortawesome/free-solid-svg-icons/faTableTennisPaddleBall';
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes';
import { faVirus } from '@fortawesome/free-solid-svg-icons/faVirus';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { Loading } from '../components';

import './Projects.css';

const ColorWheel = React.lazy(() => import('./ColorWheel'));
const GridDrawer = React.lazy(() => import('./GridDrawer'));
const Peter = React.lazy(() => import('./PeterThe3DPrinter'));
const Pong = React.lazy(() => import('./Pong'));
const Slime = React.lazy(() => import('./Slime'));
const Brightside = React.lazy(() => import('./Brightside'));
const GameOfLife = React.lazy(() => import('./GameOfLife'));

/** Defines all the projects we have available, and points to the lazy loaded component for it. */
const PROJECT_MAPPING = {
    colorWheel: <ColorWheel />,
    pong: <Pong />,
    grid: <GridDrawer />,
    peter: <Peter />,
    brightside: <Brightside />,
    slime: <Slime />,
    life: <GameOfLife />,
};

export type ProjectName = keyof typeof PROJECT_MAPPING;
const isProjectName = (name: string) => name in PROJECT_MAPPING;
export const toProjectName = (name: string): ProjectName => {
    if (!isProjectName(name)) {
        return 'slime';
    }
    return name as ProjectName;
};

interface _BaseProject {
    name: ProjectName;
    label: string;
    icon: IconDefinition;
}

interface PureProject extends _BaseProject {
    type: 'pure';
}

interface ThreeProject extends _BaseProject {
    type: 'three';
}

type Project = PureProject | ThreeProject;

const PURE_PROJECTS: PureProject[] = [
    { type: 'pure', name: 'colorWheel', label: 'Color', icon: faCircle },
    { type: 'pure', name: 'pong', label: 'Pong', icon: faTableTennisPaddleBall },
    { type: 'pure', name: 'grid', label: 'Grid', icon: faBorderAll },
    { type: 'pure', name: 'peter', label: 'Peter', icon: faCube },
    { type: 'pure', name: 'brightside', label: 'Brightside', icon: faNewspaper },
    { type: 'pure', name: 'life', label: 'Life', icon: faBacterium },
];

const THREE_PROJECTS: ThreeProject[] = [
    { type: 'three', name: 'slime', label: 'Slime', icon: faVirus },
];

function Projects({
    projectFromUrl,
    navigate,
}: {
    projectFromUrl: ProjectName;
    navigate: (destination: string) => void;
}) {
    const [selectedProject, setSelectedProject] = useState<ProjectName>(projectFromUrl);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Determine if this is needed.
    useEffect(() => {
        setSelectedProject(projectFromUrl);
    }, [projectFromUrl]);

    const handleProjectSelect = (project: ProjectName) => {
        navigate(`/projects/${project}`);
        setSelectedProject(project);
        setIsMobileMenuOpen(false); // Close menu on navigation
    };

    const handleNavigateHome = () => {
        navigate('');
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="projects-container">
            {/* Mobile hamburger button */}
            <button
                className="hamburger-button hide-desktop"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
                <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} />
            </button>

            {/* Backdrop for closing menu */}
            {isMobileMenuOpen && (
                <div
                    className="sidebar-backdrop hide-desktop"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            <Sidebar
                selectedProject={selectedProject}
                handleProjectSelect={handleProjectSelect}
                navigate={handleNavigateHome}
                isOpen={isMobileMenuOpen}
            />
            <Suspense fallback={<Loading />} key={selectedProject}>
                <div className="projects-content">{PROJECT_MAPPING[selectedProject]}</div>
            </Suspense>
        </div>
    );
}

interface SidebarProps {
    selectedProject: ProjectName | null;
    handleProjectSelect: (project: ProjectName) => void;
    navigate: () => void;
    isOpen: boolean;
}

function Sidebar({ selectedProject, handleProjectSelect, navigate, isOpen }: SidebarProps) {
    const renderSelectProjectButton = (project: Project) => (
        <button
            key={project.name}
            className={`link sidebar-link ${selectedProject === project.name ? 'active' : ''}`}
            onClick={() => handleProjectSelect(project.name)}
        >
            <FontAwesomeIcon className="icon" icon={project.icon} />
            <span className="label">{project.label}</span>
        </button>
    );

    return (
        <div className={`sidebar ${isOpen ? 'open' : ''}`}>
            <button onClick={navigate} className="link home-link purple">
                <FontAwesomeIcon className="icon" icon={faHouse} />
                <span className="label">Home</span>
            </button>

            {PURE_PROJECTS.map((project) => renderSelectProjectButton(project))}
            {THREE_PROJECTS.map((project) => renderSelectProjectButton(project))}
        </div>
    );
}

export default Projects;
