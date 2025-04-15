import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { Water } from './three/examples/jsm/objects/Water.js'; // Water is imported but not used in the provided code
import { Sky } from './three/examples/jsm/objects/Sky.js';
import { OrbitControls } from "./three/examples/jsm/controls/OrbitControls.js";
import { GUI } from '/lil-gui.module.min.js'


import GerstnerWater from '/gerstnerWater.js'
import Floater from '/floater.js'

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, -50);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#canvas"), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.setClearColor("#7CB9E8", 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableZoom = true;
controls.enablePan = true;
controls.panSpeed = 0.1;
controls.enabled = false;

const gltfLoader = new GLTFLoader();

let model, water, sky, island;
let boatHeightOffset = -2;
let waterLevel = 0;

let boatPosition = new THREE.Vector3();
let boatRotation = new THREE.Quaternion();
let boatObject = null;

const earth = new THREE.Group()
scene.add(earth)
const gui = new GUI()

const gerstnerWater = new GerstnerWater(gui)
gui.hide();
earth.add(gerstnerWater.water)

let floaters = []
let controlledBoatId = 0;


gltfLoader.load("./ship/ship.glb", (gltf) => {
    model = gltf.scene;
    model.scale.set(0.75, 0.75, 0.75);
    model.position.y -= 1;
    const group = new THREE.Group();
    group.add(model);
    const floater = new Floater(earth, group, gerstnerWater, false); // Set 'debug' to false
    floaters.push(floater);
    controlledBoatId = floaters.length - 1;
    boatObject = model; // Store the loaded model itself for easier transformations

    group.position.set(0, waterLevel + boatHeightOffset, -50); // Initial position slightly above water, considering the model's offset

    earth.add(group);

    console.log("Boat model loaded successfully:", model);

}, (xhr) => {
    console.log('Boat model loading progress:', (xhr.loaded / xhr.total * 100) + '% loaded');
}, (error) => {
    console.error('An error happened while loading the GLTF model:', error);
});

scene.add(new THREE.AmbientLight(0x404040));

const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
directionalLight.position.set(5000, 5000, 5000).normalize();
scene.add(directionalLight);

sky = new Sky();
sky.scale.setScalar(1000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 1;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.5;

const parameters = { elevation: 5, azimuth: 180 };
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const sceneEnv = new THREE.Scene();
let renderTarget;

function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    gerstnerWater.water.material.uniforms['sunDirection'].value.copy(sun);

}

updateSun();

let moveSpeed = 0;
let maxSpeed = 0.4;
const minSpeed = 0;
let speedDecrementRate = 0.002;
let speedIncrement = 0.0025;
const friction = 0.00125;
const rotateSpeed = 0.4 / 1000000;
const keys = { w: false, a: false, d: false, shift: false, c: false, space: false, r: false };
let controlState = 'boat';

// Weapon wheel variables
let isWeaponWheelOpen = false;
const weaponWheelRadius = 150; // Adjust as needed
const numberOfSections = 3;
const sectionAngle = (2 * Math.PI) / numberOfSections;
const weaponWheelCenter = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
const wheelColor = 0x444444;
const hoverColor = 0x666666;
const weaponWheelElements = [];
let hoveredSection = -1;

// Configuration variables for weapon wheel content
const weaponImages = [
    '/weapon1.png', // Path to image for section 1
    '/weapon2.png', // Path to image for section 2
    '/weapon3.png', // Path to image for section 3
];
const weaponNames = [
    'Weapon One',
    'Weapon Two',
    'Weapon Three',
];

// Create the weapon wheel elements (initially hidden)
function createWeaponWheel() {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '10'; // Ensure it's on top
    canvas.style.display = 'none'; // Initially hidden
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const drawWheel = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < numberOfSections; i++) {
            const startAngle = i * sectionAngle;
            const endAngle = (i + 1) * sectionAngle;

            ctx.beginPath();
            ctx.arc(weaponWheelCenter.x, weaponWheelCenter.y, weaponWheelRadius, startAngle, endAngle);
            ctx.lineTo(weaponWheelCenter.x, weaponWheelCenter.y);
            ctx.closePath();

            ctx.fillStyle = hoveredSection === i ? hoverColor : wheelColor;
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Load and draw images
            const img = new Image();
            img.onload = () => {
                const angle = startAngle + sectionAngle / 2;
                const x = weaponWheelCenter.x + Math.cos(angle) * (weaponWheelRadius / 2);
                const y = weaponWheelCenter.y + Math.sin(angle) * (weaponWheelRadius / 2);
                const imageSize = 30; // Adjust as needed
                ctx.drawImage(img, x - imageSize / 2, y - imageSize / 2, imageSize, imageSize);

                // Draw weapon names
                ctx.fillStyle = 'white';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                const textYOffset = imageSize / 2 + 15;
                ctx.fillText(weaponNames[i], x, y + textYOffset);
            };
            img.src = weaponImages[i % weaponImages.length]; // Cycle through images if needed
        }
    };

    canvas.addEventListener('mousemove', (event) => {
        if (isWeaponWheelOpen) {
            const angle = Math.atan2(event.clientY - weaponWheelCenter.y, event.clientX - weaponWheelCenter.x);
            let section = Math.floor((angle + Math.PI) / sectionAngle);
            if (section < 0) section += numberOfSections;
            hoveredSection = section % numberOfSections;
            drawWheel();
        }
    });

    canvas.addEventListener('mouseout', () => {
        if (isWeaponWheelOpen) {
            hoveredSection = -1;
            drawWheel();
        }
    });

    canvas.addEventListener('click', () => {
        if (isWeaponWheelOpen && hoveredSection !== -1) {
            console.log(`Selected weapon: ${weaponNames[hoveredSection]}`);
            isWeaponWheelOpen = false;
            canvas.style.display = 'none';
        }
    });

    weaponWheelElements.push(canvas);
    drawWheel(); // Initial draw to potentially load images
}

createWeaponWheel();

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;

    if (key === 'shift' && cameraView === 'side') {
        isWeaponWheelOpen = true;
        weaponWheelElements[0].style.display = 'block';
    }
});

document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
        // When 'w' is released, start slowing down
        if (key === 'w') {
            const slowDown = () => {
                if (floaters[controlledBoatId] && floaters[controlledBoatId].power < 0) {
                    floaters[controlledBoatId].power += 0.015;
                    moveSpeed -= speedDecrementRate;
                    requestAnimationFrame(slowDown);
                } else if (floaters[controlledBoatId]) {
                    floaters[controlledBoatId].power = 0;
                }
            };
            requestAnimationFrame(slowDown);
        }
        if (key === 'shift' && isWeaponWheelOpen) {
            isWeaponWheelOpen = false;
            weaponWheelElements[0].style.display = 'none';
        }
    }
});

let currentRotation = 0;
const rotationSpeed = 0.1;
let targetLean = 0;
const leanSpeed = 0.05;
let cameraZoomDistance = 100;
const zoomSpeedIdle = 0.1250;
const zoomSpeedMove = 0.1250;

const minZoom = 80;
const maxZoom = 100;

let cameraView = 'follow';
let originalCameraPosition = new THREE.Vector3();
let originalCameraLookAt = new THREE.Vector3();
let sideViewDirection = -1;

const clock = new THREE.Clock()
let delta = 0

function animate() {

    delta = clock.getDelta()
    if (boatObject && floaters[controlledBoatId]) {
        if (controlState === 'boat' && !isWeaponWheelOpen) {
            if (keys.w) {
                floaters[controlledBoatId].power = Math.max(floaters[controlledBoatId].power - 0.1, -2.5);
                moveSpeed += speedIncrement;
                //boatObject.rotation.z = 0;
            }

            if (keys.a) {
                // targetLean = moveSpeed/4
                boatObject.rotation.y += rotateSpeed;
                floaters[controlledBoatId].heading += 0.015;
            } else if (keys.d) {
                //targetLean = -moveSpeed/4
                boatObject.rotation.y -= rotateSpeed;
                floaters[controlledBoatId].heading -= 0.015;
            } else {
                //targetLean = Math.sin(currentRotation) * 0.0125;
            }

            // boatObject.rotation.z += (targetLean - boatObject.rotation.z) * leanSpeed;

            boatObject.getWorldPosition(boatPosition);
            boatObject.getWorldQuaternion(boatRotation);

            if (cameraView === 'follow') {
                // Calculate the desired camera position relative to the boat
                const cameraOffset = new THREE.Vector3(2, 35, cameraZoomDistance);

                // Create a rotation matrix from the boat's quaternion
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.makeRotationFromQuaternion(boatRotation);

                // Apply the rotation to the camera offset
                const rotatedCameraOffset = cameraOffset.applyMatrix4(rotationMatrix);

                // Add the rotated offset to the boat's world position to get the final camera position
                const finalCameraPosition = boatPosition.clone().add(rotatedCameraOffset);

                // Set the camera's position and make it look at the boat's position
                camera.position.copy(finalCameraPosition);
                camera.lookAt(boatPosition);

                // Update OrbitControls target to follow the boat
                controls.target.copy(boatPosition);
                controls.update();

            } else if (cameraView === 'side') {

                const sideOffset = new THREE.Vector3(75 * sideViewDirection, 30, 0);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.extractRotation(boatObject.matrixWorld);
                const rotatedSideOffset = sideOffset.applyMatrix4(rotationMatrix);
                const sideCameraPosition = boatPosition.clone().add(rotatedSideOffset);

                camera.position.copy(sideCameraPosition);
                camera.lookAt(boatPosition);
                controls.target.copy(boatPosition);
                controls.update();
            }

            if (!Object.values(keys).some(key => key)) {
                currentRotation += rotationSpeed;
                targetLean = Math.sin(currentRotation) * 0.035;
                boatObject.rotation.z += (targetLean - boatObject.rotation.z) * leanSpeed;
                cameraZoomDistance = Math.min(cameraZoomDistance + zoomSpeedIdle, maxZoom);
                controls.enabled = false; // Keep OrbitControls disabled when following
            } else if (keys.w || keys.a || keys.d) {
                cameraZoomDistance = Math.max(cameraZoomDistance - zoomSpeedMove, minZoom);
                controls.enabled = false; // Keep OrbitControls disabled when following
            }
        }

        if (keys.c) {
            keys.c = false;
            if (cameraView === 'follow') {
                cameraView = 'side';
                originalCameraPosition.copy(camera.position);
                originalCameraLookAt.copy(controls.target);
                controls.enabled = true; // Enable OrbitControls for side view
            } else {
                cameraView = 'follow';
                controls.enabled = false; // Disable OrbitControls when returning to follow view
            }
        }

        if (keys.r && cameraView === 'side') {
            keys.r = false;
            sideViewDirection *= -1;
        }

        floaters.forEach((f) => {
            f.update(delta)
        })

        if (floaters[controlledBoatId] && boatObject) {
            const targetYPosition = floaters[controlledBoatId].object.position.y + boatHeightOffset - 2; // Adjust for the model's initial offset
            boatObject.position.y += (targetYPosition - boatObject.position.y) * 1; // Smoothly interpolate the boat's Y position
        }
    }


    renderer.render(scene, camera);
    gerstnerWater.update(delta)
}

function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}

renderLoop();