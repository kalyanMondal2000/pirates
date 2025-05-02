import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "./three/examples/jsm/controls/OrbitControls.js";
import { GUI } from '/lil-gui.module.min.js';
import { Sky } from './three/examples/jsm/objects/Sky.js';
import GerstnerWater from '/gerstnerWater.js';
import Floater from '/floater.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000000);
camera.position.set(5, 50, 250);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#canvas"), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor("#7CB9E8", 1);

renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableZoom = true;
controls.enablePan = true;
controls.panSpeed = 0.1;
controls.enabled = true;

const gltfLoader = new GLTFLoader();

let model, water, sky, island;
let boatHeightOffset = -2;
let waterLevel = 0;

let boatPosition = new THREE.Vector3();
let boatRotation = new THREE.Quaternion();
let boatObject = null;
let currentSpeed = 0;

const earth = new THREE.Group();
scene.add(earth);
const gui = new GUI();

const gerstnerWater = new GerstnerWater(gui);
gerstnerWater.water.receiveShadow = true;
gui.hide();
earth.add(gerstnerWater.water);

let floaters = [];
let controlledBoatId = 0;

gltfLoader.load("./ship/ship.glb", (gltf) => {
    model = gltf.scene;
    model.scale.set(1, 1,1);
    model.position.y -= 1;

    // Enable shadows on all meshes
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const group = new THREE.Group();
    group.add(model);
    const floater = new Floater(earth, group, gerstnerWater, false);
    floaters.push(floater);
    controlledBoatId = floaters.length - 1;
    boatObject = model;

    group.position.set(0, waterLevel + boatHeightOffset, -50);
    earth.add(group);
    console.log("Boat model loaded successfully:", model);
}, (xhr) => {
    console.log('Boat model loading progress:', (xhr.loaded / xhr.total * 100) + '% loaded');
}, (error) => {
    console.error('An error happened while loading the GLTF model:', error);
});

// Ambient + directional light
scene.add(new THREE.AmbientLight(0x404040, 0.6));

const directionalLight = new THREE.DirectionalLight(0x404040, 0.6);
directionalLight.position.set(5000, 5000, 5000).normalize();
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

// Sky + environment lighting
sky = new Sky();
sky.scale.setScalar(100000000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 0;
skyUniforms['rayleigh'].value = 2.5;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.5;

const parameters = { elevation: 5, azimuth: 180 };
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const sun = new THREE.Vector3();
function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    directionalLight.position.copy(sun.clone().multiplyScalar(1000000));
    const envMap = pmremGenerator.fromScene(sky).texture;
    scene.environment = envMap;
}
updateSun();

let moveSpeed = 0;
let maxSpeed = 0.4;
const minSpeed = 0;
let speedDecrementRate = 0.002;
let speedIncrement = 0.0025;
const frictionCoefficient = -100;
const rotateSpeed = 0.4 / 1000000;
const keys = { w: false, a: false, d: false, shift: false, c: false, space: false, r: false };
let controlState = 'boat';

let isWeaponWheelOpen = false;
const weaponWheelRadius = 150;
const numberOfSections = 3;
const sectionAngle = (2 * Math.PI) / numberOfSections;
const weaponWheelCenter = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
const wheelColor = 0x444444;
const hoverColor = 0x666666;
const weaponWheelElements = [];
const weaponImages = ['/weapon1.png', '/weapon2.png', '/weapon3.png'];
const weaponNames = ['Weapon 1', 'Weapon 2', 'Weapon 3'];

let hoveredSection = -1;
let weaponWheelCanvas;
let weaponWheelContext;

// Zoom variables
let cameraZoomDistance = 100;
const zoomSpeedFactor = 0.2;
const minZoom = 150;
const maxZoom = 200;
let targetZoomDistance = cameraZoomDistance;

function drawWeaponWheel() {
    weaponWheelContext.clearRect(0, 0, weaponWheelCanvas.width, weaponWheelCanvas.height);

    for (let i = 0; i < numberOfSections; i++) {
        const startAngle = i * sectionAngle;
        const endAngle = (i + 1) * sectionAngle;

        weaponWheelContext.beginPath();
        weaponWheelContext.arc(weaponWheelCenter.x, weaponWheelCenter.y, weaponWheelRadius, startAngle, endAngle);
        weaponWheelContext.lineTo(weaponWheelCenter.x, weaponWheelCenter.y);
        weaponWheelContext.closePath();

        weaponWheelContext.fillStyle = (i === hoveredSection) ? hoverColor : wheelColor;
        weaponWheelContext.fill();
        weaponWheelContext.strokeStyle = 'black';
        weaponWheelContext.lineWidth = 2;
        weaponWheelContext.stroke();

        const img = new Image();
        img.onload = () => {
            const angle = startAngle + sectionAngle / 2;
            const x = weaponWheelCenter.x + Math.cos(angle) * (weaponWheelRadius / 2);
            const y = weaponWheelCenter.y + Math.sin(angle) * (weaponWheelRadius / 2);
            const imageSize = 30;
            weaponWheelContext.drawImage(img, x - imageSize / 2, y - imageSize / 2, imageSize, imageSize);

            weaponWheelContext.fillStyle = 'white';
            weaponWheelContext.font = '14px sans-serif';
            weaponWheelContext.textAlign = 'center';
            const textYOffset = imageSize / 2 + 15;
            weaponWheelContext.fillText(weaponNames[i], x, y + textYOffset);
        };
        img.src = weaponImages[i];
    }
}

function createWeaponWheel() {
    weaponWheelCanvas = document.createElement('canvas');
    weaponWheelCanvas.width = window.innerWidth;
    weaponWheelCanvas.height = window.innerHeight;
    weaponWheelCanvas.style.position = 'fixed';
    weaponWheelCanvas.style.top = '0';
    weaponWheelCanvas.style.left = '0';
    weaponWheelCanvas.style.zIndex = '10';
    weaponWheelCanvas.style.display = 'none';
    document.body.appendChild(weaponWheelCanvas);
    weaponWheelContext = weaponWheelCanvas.getContext('2d');

    weaponWheelCanvas.addEventListener('mousemove', (event) => {
        if (!isWeaponWheelOpen) return;

        const rect = weaponWheelCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const dx = mouseX - weaponWheelCenter.x;
        const dy = mouseY - weaponWheelCenter.y;
        const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

        if (distanceFromCenter <= weaponWheelRadius) {
            const angle = Math.atan2(dy, dx);
            let section = Math.floor((angle + Math.PI) / sectionAngle);
            if (section < 0) section += numberOfSections;
            const newHoveredSection = section % numberOfSections;

            if (newHoveredSection !== hoveredSection) {
                hoveredSection = newHoveredSection;
                drawWeaponWheel();
            }
        } else {
            if (hoveredSection !== -1) {
                hoveredSection = -1;
                drawWeaponWheel();
            }
        }
    });

    weaponWheelCanvas.addEventListener('mouseout', () => {
        if (hoveredSection !== -1) {
            hoveredSection = -1;
            drawWeaponWheel();
        }
    });

    weaponWheelCanvas.addEventListener('click', () => {
        if (isWeaponWheelOpen && hoveredSection !== -1) {
            console.log(`Selected weapon: ${weaponNames[hoveredSection]}`);
            isWeaponWheelOpen = false;
            weaponWheelCanvas.style.display = 'none';
            hoveredSection = -1;
            weaponWheelContext.clearRect(0, 0, weaponWheelCanvas.width, weaponWheelCanvas.height);
        }
    });

    weaponWheelElements.push(weaponWheelCanvas);
    drawWeaponWheel();
}

createWeaponWheel();

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;

    if (key === 'shift' && cameraView === 'side') {
        isWeaponWheelOpen = true;
        weaponWheelCanvas.style.display = 'block';
        drawWeaponWheel();
    }
});

document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

document.addEventListener("mousedown", () => {
    controls.enabled = true;
});

document.addEventListener("mouseup", () => {
    controls.enabled = false;
});

let currentRotation = 0;
const rotationSpeed = 0.1;
let targetLean = 0;
const leanSpeed = 0.05;
let cameraView = 'follow';
let originalCameraPosition = new THREE.Vector3();
let originalCameraLookAt = new THREE.Vector3();
let sideViewDirection = -1;
let transitioning = false; // Add this flag
let transitionDuration = 2; // in seconds
let transitionStartTime = 0;
let initialCameraPosition = new THREE.Vector3(); // Store initial camera position
let initialCameraTarget = new THREE.Vector3();   // Store initial camera target


const clock = new THREE.Clock();
let delta = 0;
function animate() {
    delta = clock.getDelta();
    if (boatObject && floaters[controlledBoatId]) {
        let isBoatMoving = keys.w || keys.a || keys.d;

        if (controlState === 'boat' && !isWeaponWheelOpen) {
            if (keys.w) {
                floaters[controlledBoatId].power = Math.max(floaters[controlledBoatId].power - 0.1, -2.5);
                currentSpeed = Math.min(currentSpeed + speedIncrement, maxSpeed);
                targetZoomDistance = Math.max(minZoom, cameraZoomDistance - currentSpeed * 100 * zoomSpeedFactor);
            } else {
                if (currentSpeed > 0) {
                    currentSpeed = Math.max(currentSpeed - speedDecrementRate, 0);
                    floaters[controlledBoatId].power = Math.min(floaters[controlledBoatId].power + 0.025, 0);
                    targetZoomDistance = Math.min(maxZoom, cameraZoomDistance + speedDecrementRate * 100 * zoomSpeedFactor);
                } else if (currentSpeed < 0) {
                    currentSpeed = Math.min(currentSpeed + speedDecrementRate, 0);
                    floaters[controlledBoatId].power = Math.max(floaters[controlledBoatId].power - 0.025, 0);
                    targetZoomDistance = Math.min(maxZoom, cameraZoomDistance + speedDecrementRate * 100 * zoomSpeedFactor);
                } else {
                    targetZoomDistance = maxZoom;
                }
            }

            floaters[controlledBoatId].speed = currentSpeed;
            cameraZoomDistance += (targetZoomDistance - cameraZoomDistance) * 0.05;

            // Rotate the boat based on input
            if (keys.a) {
                boatObject.rotation.y += rotateSpeed;
                floaters[controlledBoatId].heading += 0.015;
            } else if (keys.d) {
                boatObject.rotation.y -= rotateSpeed;
                floaters[controlledBoatId].heading -= 0.015;
            }

            boatObject.getWorldPosition(boatPosition);
            boatObject.getWorldQuaternion(boatRotation);

            // Update floaters
            floaters.forEach((f) => {
                f.update(delta);
            });

            // Update the boat's vertical position
            if (floaters[controlledBoatId] && boatObject) {
                const targetYPosition = floaters[controlledBoatId].object.position.y + boatHeightOffset - 2;
                boatObject.position.y += (targetYPosition - boatObject.position.y) * 1;
            }
        }

        // Handle camera following or orbiting with smooth transitions
        let targetCameraPosition = new THREE.Vector3();
        let targetLookAt = new THREE.Vector3();

        if (isBoatMoving) {
            // Camera follows the boat in fixed position
            const cameraOffset = new THREE.Vector3(4, 80, cameraZoomDistance);
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromQuaternion(boatRotation);
            const rotatedCameraOffset = cameraOffset.applyMatrix4(rotationMatrix);
            targetCameraPosition = boatPosition.clone().add(rotatedCameraOffset);
            targetLookAt = boatPosition;
        } else {
            // When boat is idle, keep camera position as is but look at the boat smoothly
            targetCameraPosition = camera.position.clone();
            targetLookAt = boatPosition;
        }

        // Smoothly interpolate camera position and look target
        const lerpFactor = 0.1; // Adjust between 0 and 1 for desired smoothness
        camera.position.lerp(targetCameraPosition, lerpFactor);
        controls.target.lerp(targetLookAt, lerpFactor);
        controls.enabled = !isBoatMoving;
        controls.update();

        // Toggle camera view with key 'c'
        if (keys.c) {
            keys.c = false;
            transitioning = true;
            transitionStartTime = clock.getElapsedTime();
            initialCameraPosition = camera.position.clone();
            initialCameraTarget = controls.target.clone();
            cameraView = cameraView === 'follow' ? 'side' : 'follow';
        }

        // Toggle side view direction with key 'r'
        if (keys.r && cameraView === 'side') {
            keys.r = false;
            sideViewDirection *= -1;
        }
    }

    renderer.render(scene, camera);
    gerstnerWater.update(delta);
}
function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}

renderLoop();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (weaponWheelCanvas) {
        weaponWheelCanvas.width = window.innerWidth;
        weaponWheelCanvas.height = window.innerHeight;
        weaponWheelCenter.set(window.innerWidth / 2, window.innerHeight / 2);
        drawWeaponWheel();
    }
});
