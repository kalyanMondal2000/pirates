import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "../three/examples/jsm/controls/OrbitControls.js";
import { GUI } from '/lil-gui.module.min.js';
import GerstnerWater from '/gerstnerWater.js';
import Floater from '/floater.js';
import { Sky } from "../three/examples/jsm/objects/Sky.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(5, 80, 200);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#canvas"), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableZoom = true;
controls.enablePan = true;
controls.panSpeed = 0.1;
controls.enabled = true;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
controls.minDistance = 100;
controls.maxDistance = 500;

// Optimization: Create loaders once
const gltfLoader = new GLTFLoader();
const cloudLoader = new GLTFLoader();

let model;
let boatHeightOffset = -2;
let waterLevel = 0;

let boatPosition = new THREE.Vector3();
let boatRotation = new THREE.Quaternion();
let boatObject = null;
let currentSpeed = 0;

const earth = new THREE.Group();
scene.add(earth);
const gui = new GUI();
gui.hide(); 

const gerstnerWater = new GerstnerWater(gui);
gerstnerWater.water.receiveShadow = true;
earth.add(gerstnerWater.water);

let floaters = [];
let controlledBoatId = 0;
const group = new THREE.Group();

let initialBoatPosition = new THREE.Vector3();
let initialBoatRotation = new THREE.Quaternion();
const waterExtent = 10000;
const fallDepth = -75;
let isFalling = false;

gltfLoader.load("./ship/ship.glb", (gltf) => {
    model = gltf.scene;
    model.scale.set(0.8, 0.8, 0.8);
    model.position.y -= 1;

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    group.add(model);
    const floater = new Floater(earth, group, gerstnerWater, false);
    floaters.push(floater);
    controlledBoatId = floaters.length - 1;
    boatObject = model;

    group.position.set(0, waterLevel + boatHeightOffset, -50);
    initialBoatPosition.copy(group.position);
    initialBoatRotation.copy(group.quaternion);

    earth.add(group);
    console.log("Boat model loaded successfully:", model);
}, (xhr) => {
    console.log('Boat model loading progress:', (xhr.loaded / xhr.total * 100) + '% loaded');
}, (error) => {
    console.error(error);
});


// Optimization: Reduce ambient light intensity
const ambientLight = new THREE.AmbientLight('white', 5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 512; // Further reduced shadow map size
sunLight.shadow.mapSize.height = 512; // Further reduced shadow map size
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = 1000;
sunLight.shadow.camera.left = -300; // Tighter shadow bounds
sunLight.shadow.camera.right = 300; // Tighter shadow bounds
sunLight.shadow.camera.top = 300;   // Tighter shadow bounds
sunLight.shadow.camera.bottom = -300; // Tighter shadow bounds
sunLight.shadow.radius = 0.5; // Further reduced shadow radius
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);


const sky = new Sky();
sky.scale.setScalar(1000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0.005;

const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 10);
const theta = THREE.MathUtils.degToRad(120);

sun.setFromSphericalCoords(1, phi, theta);
sky.material.uniforms['sunPosition'].value.copy(sun);

sunLight.position.set(sun.x * 1000, sun.y * 1000, sun.z * 1000);


let maxSpeed = 0.4;
let speedDecrementRate = 0.002;
let speedIncrement = 0.0025;
const rotateSpeed = 0.4 / 1000000;
const keys = { w: false, a: false, d: false, shift: false, c: false, space: false, r: false };
let controlState = 'boat';

let cameraZoomDistance = 150;
const zoomSpeedFactor = 1;

// Optimization: Use requestAnimationFrame for smoother input handling
function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
}

function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

document.addEventListener("mousedown", () => {
    controls.enabled = true;
});

document.addEventListener("mouseup", () => {
    controls.enabled = false;
});

let cloudPool = []; // Use an array for the object pool
const numberOfClouds = 15; // Further reduced number of clouds
const minCloudHeight = 300;
const maxCloudHeight = 500;
const maxClouds = 30; // Further reduced max clouds

function createCloud() {
    const cloudModelPath = './low_poly_cloud.glb';
    return new Promise((resolve) => {
        cloudLoader.load(cloudModelPath, (gltf) => {
            const cloud = gltf.scene;
            cloud.scale.set(0, 0, 0);  // Start with 0 scale
            cloud.visible = false; // Initially hide the cloud
            scene.add(cloud);
            resolve(cloud);
        }, undefined, (error) => {
            console.error(error);
            resolve(null); // Resolve with null in case of error to avoid blocking
        });
    });
}


async function spawnClouds() {
    // Create the maximum number of clouds and store them in the pool
    for (let i = 0; i < maxClouds; i++) {
        const cloud = await createCloud();
        if (cloud) {
            cloudPool.push(cloud);
        }
    }
    // Spawn the initial number of clouds from the pool
    for (let i = 0; i < numberOfClouds; i++) {
        addCloudToScene();
    }
}

function addCloudToScene() {
    if (cloudPool.length > 0) {
        const cloud = cloudPool.pop(); // Get a cloud from the pool
        cloud.position.set(
            (Math.random() - 0.5) * waterExtent,
            minCloudHeight + Math.random() * (maxCloudHeight - minCloudHeight),
            (Math.random() - 0.5) * waterExtent
        );
        const randomScale = 0.5 + Math.random() * 1.5;
        cloud.scale.set(randomScale, randomScale, randomScale);
        cloud.rotation.y = Math.random() * Math.PI * 2;
        cloud.visible = true; // Make the cloud visible
    }
}

function despawnCloud(cloud) {
    cloud.visible = false; // Hide the cloud
    cloudPool.push(cloud); // Return the cloud to the pool
}

spawnClouds();

const clock = new THREE.Clock();
let delta = 0;

function animate() {
    delta = clock.getDelta();

    if (boatObject && floaters[controlledBoatId]) {
        const currentFloater = floaters[controlledBoatId];
        const isBoatMoving = keys.w || keys.a || keys.d;
        boatObject.getWorldPosition(boatPosition);
        const isOffWater = Math.abs(boatPosition.x) > waterExtent / 2 || Math.abs(boatPosition.z) > waterExtent / 2;

        if (isOffWater && !isFalling) {
            console.log("Boat is off the water! Starting to fall.");
            isFalling = true;
            currentSpeed = 0;
        }

        if (isFalling) {
            group.position.y -= 10 * delta;
            if (group.position.y < fallDepth) {
                console.log("respawning...");
                isFalling = false;
                group.position.copy(initialBoatPosition);
                group.quaternion.copy(initialBoatRotation);
                if (typeof currentFloater.reset === 'function') {
                    currentFloater.reset();
                } else {
                    currentFloater.speed = 0;
                    currentFloater.power = 0;
                    currentFloater.heading = 0;
                }
            }
        } else {
            if (controlState === 'boat') {
                if (keys.w) {
                    currentFloater.power = Math.max(currentFloater.power - 0.1, -2.5);
                    currentSpeed = Math.min(currentSpeed + speedIncrement, maxSpeed);
                } else {
                    if (currentSpeed > 0) {
                        currentSpeed = Math.max(currentSpeed - speedDecrementRate, 0);
                        currentFloater.power = Math.min(currentFloater.power + 0.05, 0);
                    } else if (currentSpeed < 0) {
                        currentSpeed = Math.min(currentSpeed + speedDecrementRate, 0);
                        currentFloater.power = Math.max(currentFloater.power - 0.025, 0);
                    }
                }

                currentFloater.speed = currentSpeed;

                if (keys.a) {
                    boatObject.rotation.y += rotateSpeed;
                    currentFloater.heading += 0.015;
                } else if (keys.d) {
                    boatObject.rotation.y -= rotateSpeed;
                    currentFloater.heading -= 0.015;
                }

                boatObject.getWorldQuaternion(boatRotation);
                floaters.forEach((f) => { f.update(delta); });

                if (boatObject) {
                    const targetYPosition = currentFloater.object.position.y + boatHeightOffset - 2;
                    boatObject.position.y += (targetYPosition - boatObject.position.y) * 1;
                }
            }

            let targetCameraPosition = new THREE.Vector3();
            let targetLookAt = new THREE.Vector3();

            if (isBoatMoving) {
                const cameraOffset = new THREE.Vector3(4, 90, cameraZoomDistance);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.makeRotationFromQuaternion(boatRotation);
                const rotatedCameraOffset = cameraOffset.applyMatrix4(rotationMatrix);
                targetCameraPosition = boatPosition.clone().add(rotatedCameraOffset);
                targetLookAt = boatPosition;
            } else {
                targetCameraPosition = camera.position.clone();
                targetLookAt = boatPosition;
            }

            const lerpFactor = 0.1;
            camera.position.lerp(targetCameraPosition, lerpFactor);
            controls.target.lerp(targetLookAt, lerpFactor);
            controls.enabled = !isBoatMoving;
            controls.update();
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
});