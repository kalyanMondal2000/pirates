import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { GUI } from '/lil-gui.module.min.js';
import { OrbitControls } from "../three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "../three/examples/jsm/objects/Sky.js";
import GerstnerWater from "/gerstnerWater.js";
import Floater from "/floater.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(5, 80, 200);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#canvas"), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
controls.maxPolarAngle = Math.PI / 2 - 0.1;
controls.minDistance = 100;
controls.maxDistance = 500;
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
}, null, null);
const ambientLight = new THREE.AmbientLight('white', 5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 512;
sunLight.shadow.mapSize.height = 512;
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = 1000;
sunLight.shadow.camera.left = -300;
sunLight.shadow.camera.right = 300;
sunLight.shadow.camera.top = 300;
sunLight.shadow.camera.bottom = -300;
sunLight.shadow.radius = 0.5;
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
let isLoadingCannon = false;
let loadStartTime = null;
const loadDuration = 5000;
let cannonLoaded = false;
let isFiring = false;
let cameraReturnTimeout = null;
let sideViewOffset = new THREE.Vector3();
let isLoadingCannonFlag = false;
let loadStartTimeFlag = null;
document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (key === ' ') {
        if (!isLoadingCannon && !cannonLoaded && !isFiring) {
            isLoadingCannon = true;
            loadStartTime = performance.now();
            document.getElementById('cannonProgressContainer').style.display = 'block';
            moveCameraToSideView();
            isLoadingCannonFlag = true;
            loadStartTimeFlag = performance.now();
        }
    }
});
document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    if (key === ' ') {
        if (isLoadingCannon) {
            resetCannonLoading();
            isLoadingCannonFlag = false;
        } else if (cannonLoaded) {
            fireCannon();
        }
    }
});
document.addEventListener("mousedown", () => { controls.enabled = true; });
document.addEventListener("mouseup", () => { controls.enabled = false; });
const clock = new THREE.Clock();
function startGame() {
    renderLoop();
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
document.getElementById('startButton').addEventListener('click', () => {
    document.getElementById('startPage').style.display = 'none';
    startGame();
});
function animate() {
    const delta = clock.getDelta();
    TWEEN.update();
    if (isLoadingCannon) {
        const elapsed = performance.now() - loadStartTime;
        const progress = Math.min(elapsed / loadDuration, 1);
        document.getElementById('cannonProgressBar').style.width = (progress * 100) + '%';
        if (progress >= 1) {
            cannonLoaded = true;
        }
    }
    if (boatObject && floaters[controlledBoatId]) {
        const currentFloater = floaters[controlledBoatId];
        const isBoatMoving = keys.w || keys.a || keys.d;
        boatObject.getWorldPosition(boatPosition);
        const isOffWater = Math.abs(boatPosition.x) > waterExtent / 2 || Math.abs(boatPosition.z) > waterExtent / 2;
        if (isOffWater && !isFalling) {
            isFalling = true;
            currentSpeed = 0;
        }
        if (isFalling) {
            group.position.y -= 10 * delta;
            if (group.position.y < fallDepth) {
                isFalling = false;
                group.position.copy(initialBoatPosition);
                group.quaternion.copy(initialBoatRotation);
                if (typeof currentFloater.reset === 'function') currentFloater.reset();
                else { currentFloater.speed = 0; currentFloater.power = 0; currentFloater.heading = 0; }
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
                    const targetY = currentFloater.object.position.y + boatHeightOffset - 2;
                    boatObject.position.y += (targetY - boatObject.position.y) * 1;
                }
            }
            let targetCameraPosition = new THREE.Vector3();
            let targetLookAt = new THREE.Vector3();
            if (isBoatMoving) {
                const cameraOffset = new THREE.Vector3(4, 75, cameraZoomDistance);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.makeRotationFromQuaternion(boatRotation);
                const rotatedOffset = cameraOffset.clone().applyMatrix4(rotationMatrix);
                targetCameraPosition = boatPosition.clone().add(rotatedOffset);
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
            if (isLoadingCannon && sideViewOffset) {
                const boatQuat = new THREE.Quaternion();
                boatObject.getWorldQuaternion(boatQuat);
                const offsetWorld = sideViewOffset.clone().applyQuaternion(boatQuat);
                const cameraPos = new THREE.Vector3().copy(boatPosition).add(offsetWorld);
                camera.position.lerp(cameraPos, 0.1);
                controls.target.lerp(boatPosition, 0.1);
                controls.update();
            }
        }
    }
    renderer.render(scene, camera);
    gerstnerWater.update(delta);
}
function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}
function moveCameraToSideView() {
    if (!boatObject) return;
    camera.userData.defaultPosition = camera.position.clone();
    camera.userData.defaultTarget = controls.target.clone();

    const sideOffset = new THREE.Vector3(30, 20, 0);
    boatObject.getWorldQuaternion(boatObject.quaternion);
    const boatQuat = new THREE.Quaternion();
    boatObject.getWorldQuaternion(boatQuat);

    const offsetWorld = sideOffset.clone().applyQuaternion(boatQuat);
    sideViewOffset.copy(offsetWorld);
    const targetPos = new THREE.Vector3().copy(boatObject.position).add(offsetWorld);
    const targetLookAt = new THREE.Vector3().copy(boatObject.position);

    new TWEEN.Tween(camera.position)
        .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, 250)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(controls.target)
        .to({ x: targetLookAt.x, y: targetLookAt.y, z: targetLookAt.z }, 250)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
}
function resetCameraPosition() {
    if (camera.userData.defaultPosition && camera.userData.defaultTarget) {
        new TWEEN.Tween(camera.position)
            .to({ x: camera.userData.defaultPosition.x, y: camera.userData.defaultPosition.y, z: camera.userData.defaultPosition.z }, 2000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();

        new TWEEN.Tween(controls.target)
            .to({ x: camera.userData.defaultTarget.x, y: camera.userData.defaultTarget.y, z: camera.userData.defaultTarget.z }, 2000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
    }
}

function resetCannonLoading() {
    isLoadingCannon = false;
    document.getElementById('cannonProgressContainer').style.display = 'none';
    document.getElementById('cannonProgressBar').style.width = '0%';
    cannonLoaded = false;
    controls.enabled = true;
}
function fireCannon() {

    const geometry = new THREE.SphereGeometry(10, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 'black' });
    const cannonball = new THREE.Mesh(geometry, material);

    scene.add(cannonball);

    const sideOffset = new THREE.Vector3(10, 2, 0);
    const boatQuat = new THREE.Quaternion();

    boatObject.getWorldQuaternion(boatQuat);

    const rotatedOffset = sideOffset.clone().applyQuaternion(boatQuat);
    const startPos = new THREE.Vector3().copy(boatObject.position).add(rotatedOffset);



    if (cameraReturnTimeout) clearTimeout(cameraReturnTimeout);
    cameraReturnTimeout = setTimeout(() => {
        resetCameraPosition();
    }, 2000);

    cannonLoaded = false;
    isLoadingCannon = false;
    document.getElementById('cannonProgressContainer').style.display = 'none';
    document.getElementById('cannonProgressBar').style.width = '0%';
}