import React, { Suspense, useEffect, useState } from 'react';

import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBorderAll } from '@fortawesome/free-solid-svg-icons/faBorderAll';
import { faBugs } from '@fortawesome/free-solid-svg-icons/faBugs';
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle';
import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse';
import { faTableTennisPaddleBall } from '@fortawesome/free-solid-svg-icons/faTableTennisPaddleBall';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { Loading } from '../components';

import './Projects.css';

const ColorWheel = React.lazy(() => import('./ColorWheel'));
const GridDrawer = React.lazy(() => import('./GridDrawer'));
const Pong = React.lazy(() => import('./Pong'));
const Slime = React.lazy(() => import('./Slime'));

/** Defines all the projects we have available, and points to the lazy loaded component for it. */
const PROJECT_MAPPING = {
    colorWheel: <ColorWheel />,
    pong: <Pong />,
    grid: <GridDrawer />,
    slime: <Slime />,
};

export type ProjectName = keyof typeof PROJECT_MAPPING;
export const isProjectName = (name: string) => name in PROJECT_MAPPING;
export const toProjectName = (name: string): ProjectName | undefined => {
    if (!isProjectName(name)) {
        return undefined;
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
    { type: 'pure', name: 'colorWheel', label: 'Color Wheel', icon: faCircle },
    {
        type: 'pure',
        name: 'pong',
        label: 'Speed-up Pong',
        icon: faTableTennisPaddleBall,
    },
    { type: 'pure', name: 'grid', label: 'Grid Drawer', icon: faBorderAll },
];

const THREE_PROJECTS: ThreeProject[] = [
    { type: 'three', name: 'slime', label: 'Slime Simulation', icon: faBugs },
    // { type: 'three', name: 'demo', label: 'Three Demo', icon: '③' },
];

function Projects({
    projectFromUrl,
    navigate,
}: {
    projectFromUrl: ProjectName;
    navigate: (destination: string) => void;
}) {
    const [selectedProject, setSelectedProject] = useState<ProjectName>(projectFromUrl);

    // Determine if this is needed.
    useEffect(() => {
        setSelectedProject(projectFromUrl);
    }, [projectFromUrl]);

    const handleProjectSelect = (project: ProjectName) => {
        navigate(`/projects/${project}`);
        setSelectedProject(project);
    };

    return (
        <div className="projects-container">
            <Sidebar
                selectedProject={selectedProject}
                handleProjectSelect={handleProjectSelect}
                navigate={navigate}
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
    navigate: (destination: string) => void;
}

function Sidebar({ selectedProject, handleProjectSelect, navigate }: SidebarProps) {
    const renderSelectProjectButton = (project: Project) => (
        <button
            key={project.name}
            className={`sidebar-link ${selectedProject === project.name ? 'active' : ''}`}
            onClick={() => handleProjectSelect(project.name)}
        >
            <FontAwesomeIcon className="icon" icon={project.icon} />
            <h3>{project.label}</h3>
        </button>
    );

    return (
        <div className="sidebar">
            {/* // TODO: determine what to navigate to for home... */}
            <div onClick={() => navigate('')} className="sidebar-link home-link">
                <FontAwesomeIcon className="icon" icon={faHouse} />
                <h2>Home</h2>
            </div>

            {PURE_PROJECTS.map((project) => renderSelectProjectButton(project))}
            {THREE_PROJECTS.map((project) => renderSelectProjectButton(project))}
        </div>
    );
}

export default Projects;
