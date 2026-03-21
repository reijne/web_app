import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

import './Background.css';

interface NetBackgroundOptions {
    color?: number;
    backgroundColor?: number;
    points?: number;
    maxDistance?: number;
    spacing?: number;
    showDots?: boolean;
    mouseCoeffX?: number;
    mouseCoeffY?: number;
    speed?: number;
}

interface Point extends THREE.Mesh {
    ox: number;
    oy: number;
    oz: number;
    r: number;
}

const DEFAULT_OPTIONS: Required<NetBackgroundOptions> = {
    color: 0x000000,
    backgroundColor: 0xffffff,
    points: 10,
    maxDistance: 20,
    spacing: 15,
    showDots: true,
    mouseCoeffX: 1,
    mouseCoeffY: 1,
    speed: 1,
};

function isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 600
    );
}

function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function getLuminance(color: THREE.Color): number {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

const NetBackground: React.FC<NetBackgroundOptions> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const pointsRef = useRef<Point[]>([]);
    const linesMeshRef = useRef<THREE.LineSegments | null>(null);
    const linePositionsRef = useRef<Float32Array | null>(null);
    const lineColorsRef = useRef<Float32Array | null>(null);
    const mouseRef = useRef({ x: 0, y: 0, easeX: 0, easeY: 0 });
    const timeRef = useRef(0);
    const animationFrameRef = useRef<number>(0);

    const options = { ...DEFAULT_OPTIONS, ...props };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Setup renderer
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        renderer.domElement.classList.add('background-canvas');
        rendererRef.current = renderer;

        // Setup scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Setup camera
        const camera = new THREE.PerspectiveCamera(25, 1, 0.01, 10000);
        camera.position.set(50, 100, 150);
        (camera as any).tx = camera.position.x;
        (camera as any).ty = camera.position.y;
        (camera as any).tz = camera.position.z;
        (camera as any).ox = camera.position.x;
        (camera as any).oy = camera.position.y;
        (camera as any).oz = camera.position.z;
        scene.add(camera);
        cameraRef.current = camera;

        // Setup lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
        scene.add(ambientLight);

        // Container for points
        const cont = new THREE.Group();
        cont.position.set(0, 0, 0);
        scene.add(cont);

        // Create points
        const points: Point[] = [];
        let numPoints = options.points;
        let spacing = options.spacing;

        if (isMobile()) {
            numPoints = Math.floor(numPoints * 0.75);
            spacing = Math.floor(spacing * 0.65);
        }

        const createPoint = (x: number, y: number, z: number) => {
            let mesh: THREE.Mesh | THREE.Object3D;
            if (options.showDots) {
                const geometry = new THREE.SphereGeometry(0.25, 12, 12);
                const material = new THREE.MeshLambertMaterial({ color: options.color });
                mesh = new THREE.Mesh(geometry, material);
            } else {
                mesh = new THREE.Object3D() as any;
            }
            cont.add(mesh);
            const point = mesh as Point;
            point.ox = x;
            point.oy = y;
            point.oz = z;
            point.position.set(x, y, z);
            point.r = randomRange(-2, 2);
            points.push(point);
        };

        for (let i = 0; i <= numPoints; i++) {
            for (let j = 0; j <= numPoints; j++) {
                const yOffset = randomInt(-3, 3);
                let xPos = (i - numPoints / 2) * spacing + randomInt(-5, 5);
                let zPos = (j - numPoints / 2) * spacing + randomInt(-5, 5);
                if (i % 2) zPos += spacing * 0.5;

                createPoint(xPos, yOffset - randomInt(5, 15), zPos);
                createPoint(xPos + randomInt(-5, 5), yOffset + randomInt(5, 15), zPos + randomInt(-5, 5));
            }
        }
        pointsRef.current = points;

        // Create line geometry
        const numPointsTotal = points.length;
        const maxLines = numPointsTotal * numPointsTotal;
        const linePositions = new Float32Array(maxLines * 6);
        const lineColors = new Float32Array(maxLines * 6);
        linePositionsRef.current = linePositions;
        lineColorsRef.current = lineColors;

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage)
        );
        lineGeometry.setAttribute(
            'color',
            new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage)
        );
        lineGeometry.setDrawRange(0, 0);

        // Determine blending mode based on color luminance
        const foregroundColor = new THREE.Color(options.color);
        const bgColor = new THREE.Color(options.backgroundColor);
        const useAdditiveBlending = getLuminance(foregroundColor) > getLuminance(bgColor);

        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            blending: useAdditiveBlending ? THREE.AdditiveBlending : THREE.NormalBlending,
            transparent: true,
        });

        const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
        cont.add(linesMesh);
        linesMeshRef.current = linesMesh;

        // Initialize mouse position
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        mouseRef.current = {
            x: width / 2,
            y: height / 2,
            easeX: width / 2,
            easeY: height / 2,
        };

        // Resize handler
        const handleResize = () => {
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        // Mouse handler
        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
                mouseRef.current.x = x;
                mouseRef.current.y = y;
            }
        };
        window.addEventListener('mousemove', handleMouseMove);

        // Animation loop
        const animate = () => {
            timeRef.current += options.speed;

            // Smooth mouse easing
            const mouse = mouseRef.current;
            mouse.easeX += 0.05 * (mouse.x - mouse.easeX);
            mouse.easeY += 0.05 * (mouse.y - mouse.easeY);

            // Update camera position based on mouse
            const cam = cameraRef.current as any;
            if (cam) {
                const mouseXNorm = mouse.easeX / container.offsetWidth;
                const mouseYNorm = mouse.easeY / container.offsetHeight;

                const baseAngle = Math.atan2(cam.oz, cam.ox);
                const radius = Math.sqrt(cam.oz * cam.oz + cam.ox * cam.ox);
                const newAngle = baseAngle + 2 * (mouseXNorm - 0.5) * options.mouseCoeffX;

                cam.tx = radius * Math.cos(newAngle);
                cam.tz = radius * Math.sin(newAngle);
                cam.ty = cam.oy + 50 * (mouseYNorm - 0.5) * options.mouseCoeffY;

                // Smooth camera movement
                if (Math.abs(cam.tx - cam.position.x) > 0.01) {
                    cam.position.x += 0.02 * (cam.tx - cam.position.x);
                }
                if (Math.abs(cam.ty - cam.position.y) > 0.01) {
                    cam.position.y += 0.02 * (cam.ty - cam.position.y);
                }
                if (Math.abs(cam.tz - cam.position.z) > 0.01) {
                    cam.position.z += 0.02 * (cam.tz - cam.position.z);
                }
                cam.lookAt(new THREE.Vector3(0, 0, 0));
            }

            // Update points rotation
            const pts = pointsRef.current;
            for (const point of pts) {
                if (point.r !== 0) {
                    let angle = Math.atan2(point.position.z, point.position.x);
                    const dist = Math.sqrt(
                        point.position.z * point.position.z + point.position.x * point.position.x
                    );
                    angle += 0.00025 * point.r;
                    point.position.x = dist * Math.cos(angle);
                    point.position.z = dist * Math.sin(angle);
                }
            }

            // Update lines
            const linePositions = linePositionsRef.current;
            const lineColors = lineColorsRef.current;
            if (linePositions && lineColors && linesMeshRef.current) {
                let posIndex = 0;
                let colorIndex = 0;
                let lineCount = 0;

                const fgColor = new THREE.Color(options.color);
                const bg = new THREE.Color(options.backgroundColor);
                const colorDiff = fgColor.clone().sub(bg);

                for (let i = 0; i < pts.length; i++) {
                    const p1 = pts[i];
                    for (let j = i + 1; j < pts.length; j++) {
                        const p2 = pts[j];
                        const dx = p1.position.x - p2.position.x;
                        const dy = p1.position.y - p2.position.y;
                        const dz = p1.position.z - p2.position.z;
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        if (dist < options.maxDistance) {
                            const alpha = Math.min(1, Math.max(0, 2 * (1 - dist / options.maxDistance)));
                            const lineColor = useAdditiveBlending
                                ? new THREE.Color(0).lerp(colorDiff, alpha)
                                : bg.clone().lerp(fgColor, alpha);

                            linePositions[posIndex++] = p1.position.x;
                            linePositions[posIndex++] = p1.position.y;
                            linePositions[posIndex++] = p1.position.z;
                            linePositions[posIndex++] = p2.position.x;
                            linePositions[posIndex++] = p2.position.y;
                            linePositions[posIndex++] = p2.position.z;

                            lineColors[colorIndex++] = lineColor.r;
                            lineColors[colorIndex++] = lineColor.g;
                            lineColors[colorIndex++] = lineColor.b;
                            lineColors[colorIndex++] = lineColor.r;
                            lineColors[colorIndex++] = lineColor.g;
                            lineColors[colorIndex++] = lineColor.b;

                            lineCount++;
                        }
                    }
                }

                linesMeshRef.current.geometry.setDrawRange(0, lineCount * 2);
                linesMeshRef.current.geometry.attributes.position.needsUpdate = true;
                linesMeshRef.current.geometry.attributes.color.needsUpdate = true;
            }

            // Render
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.setClearColor(options.backgroundColor, 1);
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        };
        animate();

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameRef.current);

            if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
                container.removeChild(rendererRef.current.domElement);
            }
            rendererRef.current?.dispose();

            // Dispose geometries and materials
            points.forEach((point) => {
                if (point.geometry) point.geometry.dispose();
                if (point.material && 'dispose' in point.material) {
                    (point.material as THREE.Material).dispose();
                }
            });
            linesMeshRef.current?.geometry.dispose();
            (linesMeshRef.current?.material as THREE.Material)?.dispose();
        };
    }, [
        options.color,
        options.backgroundColor,
        options.points,
        options.maxDistance,
        options.spacing,
        options.showDots,
        options.mouseCoeffX,
        options.mouseCoeffY,
        options.speed,
    ]);

    return <div ref={containerRef} className="net-background-container" />;
};

export default NetBackground;
