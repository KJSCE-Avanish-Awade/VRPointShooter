"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { WebXRButton } from 'three/examples/jsm/webxr/WebXRButton.js'; // Use correct path
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

const VRGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const spheresRef = useRef<THREE.Mesh[]>([]);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [isCardboardMode, setIsCardboardMode] = useState(false);
  const vrButtonContainerRef = useRef<HTMLDivElement>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const deviceOrientationControls = useRef<DeviceOrientationControls | null>(null);
  const crosshairRef = useRef<THREE.Mesh | null>(null);

  // Device Orientation Controls (simplified version)
  class DeviceOrientationControls {
      object: THREE.Object3D;
      screenOrientation = 0;
      alphaOffset = 0; // radians
      enabled = true;
      deviceOrientation: any = {}; // Store orientation data

      constructor(object: THREE.Object3D) {
          this.object = object;
          this.object.rotation.reorder('YXZ');
          this.connect();
      }

      onDeviceOrientationChangeEvent = (event: DeviceOrientationEvent) => {
          this.deviceOrientation = event;
      };

      onScreenOrientationChangeEvent = () => {
          this.screenOrientation = (window.orientation as number) || 0;
      };

      connect = () => {
          this.onScreenOrientationChangeEvent(); // run once on load
          // iOS 13+ requires user interaction for DeviceOrientationEvent
          if ( window.DeviceOrientationEvent !== undefined && typeof (DeviceOrientationEvent as any).requestPermission === 'function' ) {
                (DeviceOrientationEvent as any).requestPermission().then( (response : string) => {
                    if ( response == 'granted' ) {
                        window.addEventListener( 'orientationchange', this.onScreenOrientationChangeEvent );
                        window.addEventListener( 'deviceorientation', this.onDeviceOrientationChangeEvent );
                    }
                } ).catch( function ( error : any ) {
                    console.error( 'THREE.DeviceOrientationControls: Unable to use DeviceOrientation API:', error );
                } );
          } else {
                window.addEventListener( 'orientationchange', this.onScreenOrientationChangeEvent );
                window.addEventListener( 'deviceorientation', this.onDeviceOrientationChangeEvent );
          }
          this.enabled = true;
      };

      disconnect = () => {
          window.removeEventListener( 'orientationchange', this.onScreenOrientationChangeEvent );
          window.removeEventListener( 'deviceorientation', this.onDeviceOrientationChangeEvent );
          this.enabled = false;
      };

      update = () => {
          if (this.enabled === false || !this.deviceOrientation.alpha) {
              return;
          }

          const alpha = this.deviceOrientation.alpha ? THREE.MathUtils.degToRad( this.deviceOrientation.alpha ) + this.alphaOffset : 0; // Z
          const beta = this.deviceOrientation.beta ? THREE.MathUtils.degToRad( this.deviceOrientation.beta ) : 0; // X'
          const gamma = this.deviceOrientation.gamma ? THREE.MathUtils.degToRad( this.deviceOrientation.gamma ) : 0; // Y''
          const orient = this.screenOrientation ? THREE.MathUtils.degToRad( this.screenOrientation ) : 0; // O

          const q = new THREE.Quaternion();
          const zee = new THREE.Vector3( 0, 0, 1 );
          const euler = new THREE.Euler();
          const q0 = new THREE.Quaternion();
          const q1 = new THREE.Quaternion( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) ); // - PI/2 around the x-axis

          euler.set( beta, alpha, - gamma, 'YXZ' ); // 'ZXY' for the device, but 'YXZ' for us
          q.setFromEuler( euler ); // orient the device
          q.multiply( q1 ); // camera looks out the back of the device, not the top
          q.multiply( q0.setFromAxisAngle( zee, - orient ) ); // adjust for screen orientation

          this.object.quaternion.copy( q );
      };

      dispose = () => {
          this.disconnect();
      };
  }


  // --- Initialization and Setup ---
  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;

    const currentMount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); // Dark gray background
    sceneRef.current = scene;

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
       vrButtonElement.style.bottom = '60px'; // Adjust position
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

    // Device Orientation for Cardboard mode
    deviceOrientationControls.current = new DeviceOrientationControls(camera);
    deviceOrientationControls.current.enabled = false; // Initially disabled


    // Animation Loop
    const animate = () => {
      renderer.setAnimationLoop(() => {
        if (!renderer || !scene || !camera) return;

        if (isCardboardMode && deviceOrientationControls.current?.enabled) {
            deviceOrientationControls.current.update();
        }

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
      if (currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      // Dispose Three.js objects
       spheresRef.current.forEach(sphere => {
         scene.remove(sphere);
         sphere.geometry.dispose();
         (sphere.material as THREE.Material).dispose();
       });
       spheresRef.current = [];
       scene.remove(camera);
       if (crosshairRef.current) {
          camera.remove(crosshairRef.current);
          crosshairRef.current.geometry.dispose();
          (crosshairRef.current.material as THREE.Material).dispose();
          crosshairRef.current = null;
       }
       scene.remove(ambientLight);
       scene.remove(directionalLight);
       renderer.dispose();
       deviceOrientationControls.current?.dispose();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Game Logic ---

  const createSpheres = (scene: THREE.Scene) => {
    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
    for (let i = 0; i < SPHERE_COUNT; i++) {
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: INITIAL_SPHERE_COLOR });
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
    if (sphere.position.length() < 2) {
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

  const handleCardboardToggle = (checked: boolean) => {
    setIsCardboardMode(checked);
     if (deviceOrientationControls.current) {
        deviceOrientationControls.current.enabled = checked;
        if (checked) {
            // Try requesting permission if needed
             if ( window.DeviceOrientationEvent !== undefined && typeof (DeviceOrientationEvent as any).requestPermission === 'function' ) {
                 (DeviceOrientationEvent as any).requestPermission().then( (response : string) => {
                     if ( response !== 'granted' ) {
                          console.warn("Device orientation permission not granted.");
                          setIsCardboardMode(false); // Revert toggle if permission denied
                          if(deviceOrientationControls.current) deviceOrientationControls.current.enabled = false;
                     }
                 }).catch((e) => {
                     console.error("Error requesting device orientation permission:", e);
                     setIsCardboardMode(false); // Revert toggle on error
                     if(deviceOrientationControls.current) deviceOrientationControls.current.enabled = false;
                 });
             }
        }
    }
    // Adjust renderer for side-by-side view if needed (Three.js handles this automatically with VRButton)
    // However, for non-WebXR Cardboard, you might need manual stereo rendering setup (more complex)
    console.log("Cardboard Mode:", checked);

    // If using Android WebView, potentially notify the native app
    if (window.Android) {
      window.Android.postMessage(JSON.stringify({ type: 'cardboardToggle', enabled: checked }));
    }
    // Similar for iOS WKWebView
     if (window.webkit?.messageHandlers?.motionHandler) {
         window.webkit.messageHandlers.motionHandler.postMessage(JSON.stringify({ type: 'cardboardToggle', enabled: checked }));
     }
  };

   // Optional: Listener for Android WebView messages (if Android sends data)
   useEffect(() => {
     const handleAndroidMessage = (event: MessageEvent) => {
       try {
         const data = JSON.parse(event.data);
         if (data.type === 'motionData' && deviceOrientationControls.current && isCardboardMode) {
           // Process motion data from Android if needed - Note: DeviceOrientationEvent is usually preferred
           // Example: Directly set camera orientation (more complex, requires quaternion math)
           // console.log("Received motion data:", data.values);
           // This part is highly dependent on the format of data sent from Android
         }
       } catch (e) {
         // console.error("Error parsing message from Android:", e);
       }
     };

     // Add listener if running inside an Android WebView context
     // The actual mechanism depends on how the WebView bridge is set up
     // document.addEventListener('message', handleAndroidMessage); // Example for standard JS bridge

     return () => {
       // document.removeEventListener('message', handleAndroidMessage);
     };
   }, [isCardboardMode]); // Re-run if cardboard mode changes


  return (
    <div ref={mountRef} className="w-full h-full relative">
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2 text-accent">
        <div className="text-2xl font-bold">Score: {score}</div>
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
      </div>
       {/* Container for VR Button */}
      <div ref={vrButtonContainerRef} id="vr-button-container" className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
         {/* VRButton will be appended here by useEffect */}
      </div>
    </div>
  );
};

export default VRGame;
