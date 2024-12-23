import React, { startTransition, Suspense, useState } from 'react';

import { Loading } from '../components';
import { Page } from '../types';

import './Projects.css';

const ColorWheel = React.lazy(() => import('./ColorWheel'));
const GridDrawer = React.lazy(() => import('./GridDrawer'));
const Pong = React.lazy(() => import('./Pong'));
const ThreeDemo = React.lazy(() => import('./Three/Demo'));

/** Defines all the projects we have available, and points to the lazy loaded component for it. */
const PROJECT_MAPPING = {
    colorWheel: <ColorWheel />,
    pong: <Pong />,
    grid: <GridDrawer />,
    demo: <ThreeDemo />,
};

type ProjectName = keyof typeof PROJECT_MAPPING;

interface _BaseProject {
    name: ProjectName;
    label: string;
    icon: string;
}

interface PureProject extends _BaseProject {
    type: 'pure';
}

interface ThreeProject extends _BaseProject {
    type: 'three';
}

type Project = PureProject | ThreeProject;

const PURE_PROJECTS: PureProject[] = [
    { type: 'pure', name: 'colorWheel', label: 'Color Wheel', icon: '🎨' },
    { type: 'pure', name: 'pong', label: 'Locking Pong', icon: '║' },
    { type: 'pure', name: 'grid', label: 'Grid Drawer', icon: '▦' },
];

const THREE_PROJECTS: ThreeProject[] = [
    { type: 'three', name: 'demo', label: 'Three Demo', icon: '③' },
];

function Projects({ setCurrentPage }: { setCurrentPage: (page: Page) => void }) {
    const [selectedProject, setSelectedProject] = useState<ProjectName>('colorWheel');

    return (
        <div className="projects-container">
            <Sidebar
                selectedProject={selectedProject}
                onSelectProject={setSelectedProject}
                setCurrentPage={setCurrentPage}
            />
            <Suspense fallback={<Loading />} key={selectedProject}>
                <div className="projects-content">{PROJECT_MAPPING[selectedProject]}</div>
            </Suspense>
        </div>
    );
}

interface SidebarProps {
    selectedProject: ProjectName | null;
    onSelectProject: (project: ProjectName) => void;
    setCurrentPage: (page: Page) => void;
}

function Sidebar({ selectedProject, onSelectProject, setCurrentPage }: SidebarProps) {
    const handleProjectSelect = (project: ProjectName) => {
        startTransition(() => {
            onSelectProject(project);
        });
    };

    const renderSelectProjectButton = (project: Project) => (
        <button
            key={project.name}
            className={`sidebar-link ${selectedProject === project.name ? 'active' : ''}`}
            onClick={() => handleProjectSelect(project.name)}
        >
            <div className="icon">{project.icon}</div>
            <h3>{project.label}</h3>
        </button>
    );

    return (
        <div className="sidebar">
            <div onClick={() => setCurrentPage('home')} className="sidebar-link home-link">
                <div className="icon">⌂</div> <h2>Home</h2>
            </div>

            {PURE_PROJECTS.map(project => renderSelectProjectButton(project))}
            {THREE_PROJECTS.map(project => renderSelectProjectButton(project))}
        </div>
    );
}

export default Projects;
