import * as THREE from "https://cdn.jsdelivr.net/gh/kalyanMondal2000/three@master/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js";
import { Sky } from "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/objects/Sky.js";


import { GUI } from 'https://cdn.jsdelivr.net/gh/kalyanMondal2000/lil-gui@master/lil-gui.module.min.js';
import GerstnerWater from "https://cdn.jsdelivr.net/gh/kalyanMondal2000/gerstnerWater@master/gerstnerWater.js";


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




scene.add(new THREE.AmbientLight());

const earth = new THREE.Group()
scene.add(earth)
const gui = new GUI()
gui.hide()

const gerstnerWater = new GerstnerWater(gui)
earth.add(gerstnerWater.water)









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


    renderer.render(scene, camera);
    if (controls.enabled) controls.update();
}

function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}

renderLoop();