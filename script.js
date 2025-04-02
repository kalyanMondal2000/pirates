import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from '../three/examples/jsm/loaders/FBXLoader.js';
import { Water } from './three/examples/jsm/objects/Water.js';
import { Sky } from './three/examples/jsm/objects/Sky.js';
import { OrbitControls } from "./three/examples/jsm/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 30);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#canvas"), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.setClearColor("#7CB9E8", 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableZoom = false;
controls.enablePan = false;
controls.panSpeed = 0.1;

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

let model, water, sky, island;
let boatHeight = -2;

let boatPosition = new THREE.Vector3();

gltfLoader.load("./ship/ship.glb", (object) => {
    model = object.scene;
    scene.add(model);
    model.scale.set(0.25, 0.25, 0.25);
    model.position.set(0, 0, -50);
    model.rotation.y = 0;
    model.getWorldPosition(boatPosition);
});

const loadIsland1 = (url) => {
    gltfLoader.load(url, (obj) => {
        island = obj.scene;
        scene.add(island);
        island.scale.set(0.125, 0.125, 0.125);

        let islandPosition = new THREE.Vector3();
        let validPosition = false;

        while (!validPosition) {
            islandPosition.z = Math.random() * (1000 + 1000) - 1000;
            islandPosition.x = Math.random() * (1000 + 1000) - 1000;

            const distanceToBoat = boatPosition.distanceTo(islandPosition);

            if (distanceToBoat > 50) {
                validPosition = true;
            }
        }

        island.position.copy(islandPosition);
        island.rotation.y = 0;
    });
};

for (let x = 0; x <= 150; x++) {
    loadIsland1('./miscAssets/island1.glb');
}

scene.add(new THREE.AmbientLight());

const waterGeometry = new THREE.PlaneGeometry(5000, 5000, 256, 256);
const waterTexture = new THREE.TextureLoader().load('waternormals.jpg');
waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;

water = new Water(waterGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: waterTexture,
    sunDirection: new THREE.Vector3(),
    sunColor: 0x001e0f,
    distortionScale: 1,
    fog: scene.fog !== undefined
});
water.rotation.x = -Math.PI / 2;
scene.add(water);

sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 1;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.5;

const parameters = { elevation: 0, azimuth: 180 };
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const sceneEnv = new THREE.Scene();
let renderTarget;

function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();
    if (renderTarget) {
        renderTarget.dispose();
    }
    sceneEnv.add(sky);
    renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.add(sky);
    scene.environment = renderTarget.texture;
}

updateSun();

let moveSpeed = 0;
let maxSpeed = 0.25;
const minSpeed = 0;
let speedIncrement = 0.0025;
const friction = 0.00125;
const rotateSpeed = 0.004;
const keys = { w: false, a: false, d: false, shift: false, c: false, space: false, r: false };
let controlState = 'boat';

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
});

document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

let currentRotation = 0;
const rotationSpeed = 0.01;
let targetLean = 0;
const leanSpeed = 0.05;
let cameraZoomDistance = 35;
const zoomSpeedIdle = 0.025;
const zoomSpeedMove = 0.025;

const minZoom = 30;
const maxZoom = 35;

let cameraView = 'follow';
let originalCameraPosition = new THREE.Vector3();
let originalCameraLookAt = new THREE.Vector3();
let sideViewDirection = -1;

const weaponWheel = document.createElement('div');
weaponWheel.style.position = 'absolute';
weaponWheel.style.top = '50%';
weaponWheel.style.left = '50%';
weaponWheel.style.transform = 'translate(-50%, -50%)';
weaponWheel.style.width = '200px';
weaponWheel.style.height = '200px';
weaponWheel.style.borderRadius = '50%';
weaponWheel.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
weaponWheel.style.display = 'none'; 
document.body.appendChild(weaponWheel);

function animate() {
    if (model) {
        if (controlState === 'boat') {
            if (keys.w && moveSpeed < maxSpeed) {
                moveSpeed += speedIncrement;
            }
            if (!keys.w) {
                moveSpeed -= friction;
                if (moveSpeed < minSpeed) {
                    moveSpeed = minSpeed;
                }
            }
            model.translateZ(-moveSpeed);

            if (keys.a) {
                model.rotation.y += rotateSpeed;
                targetLean = moveSpeed / 2;
            } else if (keys.d) {
                model.rotation.y -= rotateSpeed;
                targetLean = -moveSpeed / 2;
            } else {
                targetLean = Math.sin(currentRotation) * 0.025;
            }

            model.rotation.z += (targetLean - model.rotation.z) * leanSpeed;

            model.getWorldPosition(boatPosition);

            if (cameraView === 'follow') {
                const cameraOffset = new THREE.Vector3(1, 15, cameraZoomDistance);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.extractRotation(model.matrixWorld);
                const rotatedCameraOffset = cameraOffset.applyMatrix4(rotationMatrix);
                const finalCameraPosition = boatPosition.clone().add(rotatedCameraOffset);

                camera.position.copy(finalCameraPosition);
                camera.lookAt(boatPosition);
            } else if (cameraView === 'side') {
                const sideOffset = new THREE.Vector3(28 * sideViewDirection, 10, 0);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.extractRotation(model.matrixWorld);
                const rotatedSideOffset = sideOffset.applyMatrix4(rotationMatrix);
                const sideCameraPosition = boatPosition.clone().add(rotatedSideOffset);

                camera.position.copy(sideCameraPosition);
                camera.lookAt(boatPosition);

                // Weapon wheel logic
                if (keys.shift) {
                    weaponWheel.style.display = 'block';
                } else {
                    weaponWheel.style.display = 'none';
                }
            }

            if (!Object.values(keys).some(key => key)) {
                currentRotation += rotationSpeed;
                model.position.y = boatHeight;
                controls.target.copy(model.position);
                controls.update();
                targetLean = Math.sin(currentRotation) * 0.035;
                model.rotation.z += (targetLean - model.rotation.z) * leanSpeed;
                cameraZoomDistance = Math.min(cameraZoomDistance + zoomSpeedIdle, maxZoom);
                controls.enabled = true;
            } else if (keys.w || keys.a || keys.d) {
                cameraZoomDistance = Math.max(cameraZoomDistance - zoomSpeedMove, minZoom);
                controls.enabled = false;
            }
        }

        if (keys.c) {
            keys.c = false;
            if (cameraView === 'follow') {
                cameraView = 'side';
                originalCameraPosition.copy(camera.position);
                originalCameraLookAt.copy(controls.target);
            } else {
                cameraView = 'follow';
            }
        }

        if (keys.r && cameraView === 'side') {
            keys.r = false;
            sideViewDirection *= -1;
        }
    }

    water.material.uniforms['time'].value += 0.01;
    water.material.uniforms['size'].value = 5;
    renderer.render(scene, camera);
    if (controls.enabled) controls.update();
}

function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}

renderLoop();