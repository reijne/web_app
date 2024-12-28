import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

import './Demo.css';

const DemoScene: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        const planets: THREE.Mesh[] = [];
        const stars: THREE.Points[] = [];

        // Resize to fit parent container
        const resizeRendererToDisplaySize = () => {
            if (mountRef.current) {
                const { width, height } = mountRef.current.getBoundingClientRect();
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        };

        const currentMount = mountRef.current;
        resizeRendererToDisplaySize();
        currentMount?.appendChild(renderer.domElement);

        // 🌟 Create Starfield
        const starGeometry = new THREE.BufferGeometry();
        const starVertices = [];
        for (let i = 0; i < 1000; i++) {
            const x = (Math.random() - 0.5) * 1000;
            const y = (Math.random() - 0.5) * 1000;
            const z = -Math.random() * 1000;
            starVertices.push(x, y, z);
        }
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
        const starField = new THREE.Points(starGeometry, starMaterial);
        stars.push(starField);
        scene.add(starField);

        // 🪐 Create Planets
        const createPlanet = (size: number, color: number, distance: number) => {
            const geometry = new THREE.SphereGeometry(size, 32, 32);
            const material = new THREE.MeshStandardMaterial({ color });
            const planet = new THREE.Mesh(geometry, material);
            planet.position.set(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200,
                -distance,
            );
            planets.push(planet);
            scene.add(planet);
        };

        for (let i = 0; i < 10; i++) {
            createPlanet(Math.random() * 3 + 1, Math.random() * 0xffffff, i * 100);
        }

        // 🌞 Light Source
        const light = new THREE.PointLight(0xffffff, 1.5);
        light.position.set(0, 0, 50);
        scene.add(light);

        // Camera starting position
        camera.position.z = 50;

        // 🚀 Flythrough effect (Move camera forward)
        let speed = 0.3;
        const animate = () => {
            requestAnimationFrame(animate);
            planets.forEach(planet => (planet.rotation.y += 0.005));

            // Move the stars backward to simulate movement
            stars.forEach(star => (star.position.z += speed));

            if (stars[0].position.z > 200) {
                stars[0].position.z = -1000;
            }

            camera.position.z -= speed;
            renderer.render(scene, camera);
        };
        animate();

        // Handle keyboard for speed boost
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp' || event.key === 'w') speed = 1.5;
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp' || event.key === 'w') speed = 0.3;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Handle resize
        const resizeObserver = new ResizeObserver(resizeRendererToDisplaySize);
        if (currentMount) resizeObserver.observe(currentMount);

        return () => {
            resizeObserver.disconnect();
            currentMount?.removeChild(renderer.domElement);
            renderer.dispose();
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return <div className="demo-scene" ref={mountRef}></div>;
};

export default DemoScene;
