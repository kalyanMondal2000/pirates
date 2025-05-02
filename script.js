import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "./three/examples/jsm/controls/OrbitControls.js";
import { GUI } from '/lil-gui.module.min.js';
import { Sky } from './three/examples/jsm/objects/Sky.js';
import GerstnerWater from '/gerstnerWater.js';
import Floater from '/floater.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000000);
camera.position.set(5, 80, 200);
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


import * as POSTPROCESSING from "postprocessing"
import { SSGIEffect, TRAAEffect, MotionBlurEffect, VelocityDepthNormalPass } from "realism-effects"

const composer = new POSTPROCESSING.EffectComposer(renderer)

const velocityDepthNormalPass = new VelocityDepthNormalPass(scene, camera)
composer.addPass(velocityDepthNormalPass)

// SSGI
const ssgiEffect = new SSGIEffect(scene, camera, velocityDepthNormalPass, options?)

// TRAA
const traaEffect = new TRAAEffect(scene, camera, velocityDepthNormalPass)

// Motion Blur
const motionBlurEffect = new MotionBlurEffect(velocityDepthNormalPass)

// HBAO
const hbaoEffect = new HBAOEffect(composer, camera, scene)

const effectPass = new POSTPROCESSING.EffectPass(camera, ssgiEffect, hbaoEffect, traaEffect, motionBlur)

composer.addPass(effectPass)

const gltfLoader = new GLTFLoader();

let model, sky;
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


scene.add(new THREE.AmbientLight('white',8));

let maxSpeed = 0.4;
let speedDecrementRate = 0.002;
let speedIncrement = 0.0025;
const rotateSpeed = 0.4 / 1000000;
const keys = { w: false, a: false, d: false, shift: false, c: false, space: false, r: false };
let controlState = 'boat';

let cameraZoomDistance = 100;
const zoomSpeedFactor = 1;
const minZoom = 150;
const maxZoom = 200;
let targetZoomDistance = cameraZoomDistance;

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
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


const clock = new THREE.Clock();
let delta = 0;
function animate() {
    delta = clock.getDelta();
    if (boatObject && floaters[controlledBoatId]) {
        let isBoatMoving = keys.w || keys.a || keys.d;

        if (controlState === 'boat') {
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

            
            if (keys.a) {
                boatObject.rotation.y += rotateSpeed;
                floaters[controlledBoatId].heading += 0.015;
            } else if (keys.d) {
                boatObject.rotation.y -= rotateSpeed;
                floaters[controlledBoatId].heading -= 0.015;
            }

            boatObject.getWorldPosition(boatPosition);
            boatObject.getWorldQuaternion(boatRotation);

            floaters.forEach((f) => {
                f.update(delta);
            });

            if (floaters[controlledBoatId] && boatObject) {
                const targetYPosition = floaters[controlledBoatId].object.position.y + boatHeightOffset - 2;
                boatObject.position.y += (targetYPosition - boatObject.position.y) * 1;
            }
        }

        
        let targetCameraPosition = new THREE.Vector3();
        let targetLookAt = new THREE.Vector3();

        if (isBoatMoving) {
            
            const cameraOffset = new THREE.Vector3(4, 80, cameraZoomDistance);
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
