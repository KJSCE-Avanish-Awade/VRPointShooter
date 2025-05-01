
"use client";

import React, { useRef, useEffect, useState, useCallback, ReactNode } from 'react';
import * as THREE from 'three';
// import { Switch } from '@/components/ui/switch'; // Removed
// import { Label } from '@/components/ui/label'; // Removed
import { Button } from '@/components/ui/button';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'; // Use correct path for VRButton

// Define interfaces for Android WebView communication if needed
interface AndroidWebView {
  postMessage(message: string): void;
}

declare global {
  interface Window {
    Android?: AndroidWebView; // For communicating with Android WebView
    webkit?: {
      messageHandlers?: {
        motionHandler?: {
          postMessage(message: string): void;
        };
      };
    };
  }
}

// Constants
const SPHERE_COUNT = 10;
const SPHERE_RADIUS = 0.5;
const SCENE_BOUNDS = 10; // Defines the area where spheres can spawn
const HIT_FLASH_DURATION = 150; // ms
const INITIAL_SPHERE_COLOR = 0xffffff; // White
const HIT_SPHERE_COLOR = 0x00ff00; // Bright green
// Placeholder background URL
const BACKGROUND_IMAGE_URL = '/bg_img.png'; // Use local path

type GameState = "home" | "playing" | "paused";

const HomeScreen: React.FC<{ onStartGame: () => void }> = ({ onStartGame }) => {
  return (
  <div className="w-full h-full flex flex-col justify-center items-center absolute top-0 left-0 bg-black z-50">
    <h1 className="text-4xl text-white font-bold mb-8">VR Game</h1>
    <Button onClick={onStartGame}>Start Game</Button>
  </div>
);};

const PauseScreen: React.FC<{ onResume: () => void; onGoHome: () => void }> = ({ onResume, onGoHome }) => (
  <div className="w-full h-full flex flex-col justify-center items-center absolute top-0 left-0 bg-black z-50">
    <h1 className="text-4xl text-white font-bold mb-8">Game Paused</h1>
    <Button onClick={onResume} className="mb-4">Resume</Button><Button onClick={onGoHome}>Back to Home</Button>
  </div>
);

const VRGame: React.FC = () => {

  const [gameState, setGameState] = useState<GameState>('home');
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const startGame = () => {
    setScore(0);
    scoreRef.current = 0;
    setGameState('playing');

  };

   const pauseGame = () => {
     setGameState('paused');
   };
 
   const resumeGame = () => {
     setGameState('playing');
   };
 
  const renderContent = (): ReactNode => {
    if (gameState === "home") return <HomeScreen onStartGame={startGame} />;
    if (gameState === "paused")
      return <PauseScreen onResume={resumeGame} onGoHome={() => setGameState("home")} />;
     return null
  };
    const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const spheresRef = useRef<THREE.Mesh[]>([]);
  const vrButtonContainerRef = useRef<HTMLDivElement>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  // const deviceOrientationControls = useRef<any | null>(null); // Removed DeviceOrientationControls ref
  const crosshairRef = useRef<THREE.Mesh | null>(null);
  const backgroundTextureRef = useRef<THREE.Texture | null>(null);


  // --- Initialization and Setup ---
  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;

    const currentMount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x222222); // Replaced with texture
    sceneRef.current = scene;

    // Background Texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      BACKGROUND_IMAGE_URL,
      (texture) => {
        // Create a sphere geometry for the background
        const backgroundGeometry = new THREE.SphereGeometry(500, 60, 40); // Large radius
        // Create a material with the texture
        const backgroundMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide, // Render inside of the sphere
          color: new THREE.Color(0x808080) // Dark gray color
        });       
        // Create a mesh with the geometry and material
        const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
        scene.add(backgroundMesh); 
         // Lower the opacity of the backgroundMaterial
         backgroundMaterial.transparent = true; // Enable transparency
         backgroundMaterial.opacity = 0.5;
        
        backgroundTextureRef.current = texture;
        // No need to set scene.background

        

        

            

             // Add AI hint for the placeholder image
            if (mountRef.current) {
                const imgHint = document.createElement('div');
                imgHint.setAttribute('data-ai-hint', 'night sky stars mountain');
                imgHint.style.display = 'none'; // Hide the hint element
                mountRef.current.appendChild(imgHint);
            }
        },
        undefined, // onProgress callback (optional)
        (err) => {
            console.error('An error happened loading the background texture:', err);
             // Use a basic background color if the texture fails
            scene.background = new THREE.Color(0x222222);

             // Remove the AI hint element if present
            const hintElement = mountRef.current?.querySelector('div[data-ai-hint]');
            if (hintElement) {
                mountRef.current?.removeChild(hintElement);
            }
        }
    );


    // Camera
    const camera = new THREE.PerspectiveCamera(
      75, // Field of view
      currentMount.clientWidth / currentMount.clientHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    camera.position.z = 0.1; // Position camera slightly forward for VR
    scene.add(camera); // Add camera to scene so crosshair can be child
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.xr.enabled = true; // Enable WebXR
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);

     // Add VR Button conditionally
    if (vrButtonContainerRef.current) {
      const vrButtonElement = VRButton.createButton(renderer);
      vrButtonContainerRef.current.appendChild(vrButtonElement);
      // Style the VR button if needed
       vrButtonElement.style.position = 'absolute';
       vrButtonElement.style.bottom = '20px'; // Adjusted position slightly up
       vrButtonElement.style.left = '50%';
       vrButtonElement.style.transform = 'translateX(-50%)';
       vrButtonElement.style.zIndex = '100';
    } else {
      console.warn("VR Button container not found");
    }


    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Crosshair (simple dot)
    const crosshairGeometry = new THREE.SphereGeometry(0.005, 16, 16);
    const crosshairMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8 }); // Bright green, always visible
    const crosshair = new THREE.Mesh(crosshairGeometry, crosshairMaterial);
    crosshair.position.z = -1; // Position in front of the camera
    camera.add(crosshair); // Attach crosshair to camera
    crosshairRef.current = crosshair;


    // Spheres
    createSpheres(scene);

    // Device Orientation for Cardboard mode - REMOVED
    // deviceOrientationControls.current = new DeviceOrientationControls(camera);
    // deviceOrientationControls.current.enabled = false; // Initially disabled


    // Animation Loop
    const animate = () => {
      renderer.setAnimationLoop(() => {
        if (!renderer || !scene || !camera) return;

        // Removed Cardboard mode update
        // if (isCardboardMode && deviceOrientationControls.current?.enabled) {
        //     deviceOrientationControls.current.update();
        // }

        checkHits();
        renderer.render(scene, camera);
      });
    };

    animate();


    // Handle Resize
    const handleResize = () => {
      if (!renderer || !camera || !currentMount) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      renderer.setAnimationLoop(null);
      if (renderer.xr.getSession()) {
        renderer.xr.getSession()?.end();
      }
      window.removeEventListener('resize', handleResize);
       if (currentMount && renderer.domElement) {
         // Check if vrButtonContainerRef.current has children before removing
         if (vrButtonContainerRef.current && vrButtonContainerRef.current.firstChild) {
             vrButtonContainerRef.current.removeChild(vrButtonContainerRef.current.firstChild);
         }
         if (currentMount.contains(renderer.domElement)) {
            currentMount.removeChild(renderer.domElement);
         }
          // Remove AI hint element
          const hintElement = currentMount.querySelector('div[data-ai-hint]');
          if (hintElement) {
              currentMount.removeChild(hintElement);
          }
       }
      // Dispose Three.js objects
       if(sceneRef.current) {
           spheresRef.current.forEach(sphere => {
             sceneRef.current?.remove(sphere);
             sphere.geometry.dispose();
             (sphere.material as THREE.Material).dispose();
           });
           spheresRef.current = [];
           if(cameraRef.current) sceneRef.current.remove(cameraRef.current);
           if (crosshairRef.current && cameraRef.current) {
              cameraRef.current.remove(crosshairRef.current);
              crosshairRef.current.geometry.dispose();
              (crosshairRef.current.material as THREE.Material).dispose();
              crosshairRef.current = null;
           }
           sceneRef.current.remove(ambientLight);
           sceneRef.current.remove(directionalLight);
       }
       if(backgroundTextureRef.current) {
           backgroundTextureRef.current.dispose();
           
           backgroundTextureRef.current = null;
           if(sceneRef.current) sceneRef.current.background = null;
       }
       renderer.dispose();
      // deviceOrientationControls.current?.dispose(); // Removed
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Game Logic ---

  const createSpheres = (scene: THREE.Scene) => {
    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
    for (let i = 0; i < SPHERE_COUNT; i++) {
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: INITIAL_SPHERE_COLOR, metalness: 0.2, roughness: 0.8 }); // Slightly less shiny
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      positionSphereRandomly(sphere);
      sphere.userData.hit = false; // Custom data to track hit state
      scene.add(sphere);
      spheresRef.current.push(sphere);
    }
  };

  const positionSphereRandomly = (sphere: THREE.Mesh) => {
    sphere.position.set(
      (Math.random() - 0.5) * 2 * SCENE_BOUNDS, // x
      (Math.random() - 0.5) * 2 * SCENE_BOUNDS, // y (allow vertical spread)
      (Math.random() - 0.5) * 2 * SCENE_BOUNDS - SCENE_BOUNDS // z (mostly in front)
    );
    // Ensure spheres don't spawn too close to the camera origin
    if (sphere.position.length() < 3) { // Increased minimum distance
        positionSphereRandomly(sphere); // Reposition if too close
    }
    sphere.userData.hit = false; // Reset hit state
    (sphere.material as THREE.MeshStandardMaterial).color.setHex(INITIAL_SPHERE_COLOR); // Reset color
    sphere.visible = true; // Make visible again
  };

  const checkHits = useCallback(() => {
    if (!cameraRef.current || !sceneRef.current) return;

    raycasterRef.current.setFromCamera({ x: 0, y: 0 }, cameraRef.current); // Ray points from center of camera

    const intersects = raycasterRef.current.intersectObjects(spheresRef.current);

    if (intersects.length > 0) {
      const intersectedSphere = intersects[0].object as THREE.Mesh;

      if (!intersectedSphere.userData.hit && intersectedSphere.visible) {
        intersectedSphere.userData.hit = true; // Mark as hit to prevent multiple triggers
        flashAndRemoveSphere(intersectedSphere);
        scoreRef.current += 1;
        setScore(scoreRef.current); // Update React state for display
      }
    }
  }, []); // Dependencies might be needed if camera or spheres change outside useEffect

   const flashAndRemoveSphere = (sphere: THREE.Mesh) => {
    const originalColor = (sphere.material as THREE.MeshStandardMaterial).color.getHex();
    (sphere.material as THREE.MeshStandardMaterial).color.setHex(HIT_SPHERE_COLOR); // Flash green

    setTimeout(() => {
        sphere.visible = false; // Hide sphere
        // Optionally reposition after a longer delay or immediately
        setTimeout(() => positionSphereRandomly(sphere), 500); // Respawn after short delay
    }, HIT_FLASH_DURATION);
  };


  // --- Event Handlers ---

  // Removed handleCardboardToggle function

   // Removed Android/iOS message handling useEffect


  return (
    <div ref={mountRef} className="w-full h-full relative">{renderContent()}
      {/* UI Overlay */}
        {gameState === 'playing' && <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2 text-accent">
        <div className="text-2xl font-bold">Score: {score}</div>
        {/* Removed Cardboard Toggle Switch and Label */}
        {/*
        <div className="flex items-center space-x-2">
          <Switch
            id="cardboard-mode"
            checked={isCardboardMode}
            onCheckedChange={handleCardboardToggle}
            aria-label="Toggle Cardboard VR Mode"
          />
          <Label htmlFor="cardboard-mode" className="text-foreground">
            Cardboard VR
          </Label>
        </div>
         */}{gameState === "playing" && <Button className="mt-2" onClick={pauseGame}>Pause</Button>}
      </div>}
       {/* Container for VR Button */}
      <div ref={vrButtonContainerRef} id="vr-button-container" className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
         {/* VRButton will be appended here by useEffect */}
      </div>
    </div>
  );
};

export default VRGame;
