import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

import './Demo.css';

const DemoScene: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            75,
            1, // Aspect ratio placeholder (will update dynamically)
            0.1,
            1000,
        );
        const renderer = new THREE.WebGLRenderer();

        // Function to resize renderer to parent size
        const resizeRendererToDisplaySize = () => {
            if (mountRef.current) {
                const { width, height } = mountRef.current.getBoundingClientRect();
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        };

        // Initialize scene
        const currentMount = mountRef.current;
        resizeRendererToDisplaySize();
        currentMount?.appendChild(renderer.domElement);

        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        camera.position.z = 5;

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
        };
        animate();

        // Resize on parent size change (optional)
        const resizeObserver = new ResizeObserver(resizeRendererToDisplaySize);
        if (currentMount) {
            resizeObserver.observe(currentMount);
        }

        return () => {
            resizeObserver.disconnect();
            currentMount?.removeChild(renderer.domElement);
            renderer.dispose();
        };
    }, []);

    return <div className="demo-scene" ref={mountRef}></div>;
};

export default DemoScene;
