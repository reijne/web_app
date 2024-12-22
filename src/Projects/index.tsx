import React, { startTransition, useState } from 'react';

import './Projects.css';

const ColorWheel = React.lazy(() => import('./ColorWheel'));
const GridDrawer = React.lazy(() => import('./GridDrawer'));
const Pong = React.lazy(() => import('./Pong'));

// Define a type for the project keys
type ProjectName = 'colorWheel' | 'pong' | 'grid';

// Optional: Create an array for mapping through the projects
const PROJECTS: { name: ProjectName; label: string; icon: string }[] = [
    { name: 'colorWheel', label: 'Color Wheel', icon: '🎨' },
    { name: 'pong', label: 'Locking Pong', icon: '║' },
    { name: 'grid', label: 'Grid Drawer', icon: '▦' },
];

function Projects() {
    const [selectedProject, setSelectedProject] = useState<ProjectName>('colorWheel');

    const renderProject = () => {
        switch (selectedProject) {
            case 'colorWheel':
                return <ColorWheel />;
            case 'pong':
                return <Pong />;
            case 'grid':
                return <GridDrawer />;
            default:
                throw Error(`Invalid project name: ${selectedProject}`);
        }
    };

    return (
        <div className="projects-container">
            <Sidebar selectedProject={selectedProject} onSelectProject={setSelectedProject} />
            <div className="projects-content">{renderProject()}</div>
        </div>
    );
}

interface SidebarProps {
    selectedProject: ProjectName | null;
    onSelectProject: (project: ProjectName) => void;
}

function Sidebar({ selectedProject, onSelectProject }: SidebarProps) {
    const handleProjectSelect = (project: ProjectName) => {
        startTransition(() => {
            onSelectProject(project);
        });
    };

    return (
        <div className="sidebar">
            <a href="/" className="sidebar-link home-link">
                <div className="icon">🏠</div> <h2>Home</h2>
            </a>

            {PROJECTS.map(project => (
                <button
                    key={project.name}
                    className={`sidebar-link ${selectedProject === project.name ? 'active' : ''}`}
                    onClick={() => handleProjectSelect(project.name)}
                >
                    <div className="icon">{project.icon}</div>
                    <h3>{project.label}</h3>
                </button>
            ))}
        </div>
    );
}

export default Projects;
