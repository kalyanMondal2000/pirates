import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.152.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.152.0/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'https://cdn.jsdelivr.net/npm/three@0.152.0/examples/jsm/objects/Sky.js';
import { GUI } from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17.0/dist/lil-gui.min.js';

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
sky.scale.setScalar(10000);
scene.add(sky);
const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0.005;
const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(80);
const theta = THREE.MathUtils.degToRad(120);
sun.setFromSphericalCoords(1, phi, theta);
sky.material.uniforms['sunPosition'].value.copy(sun);
const sunLightPos = new THREE.Vector3();
sunLightPos.set(sun.x * 1000, sun.y * 1000, sun.z * 1000);
sunLight.position.copy(sunLightPos);

let maxSpeed = 0.4;
let speedDecrementRate = 0.002;
let speedIncrement = 0.0025;
const rotateSpeed = 0.4 / 1000000;
const keys = { w: false, a: false, d: false, shift: false, c: false, r: false };
let controlState = 'boat';
let cameraZoomDistance = 150;
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = true; });
document.addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; });
document.addEventListener("mousedown", () => { controls.enabled = true; });
document.addEventListener("mouseup", () => { controls.enabled = false; });
const clock = new THREE.Clock();

const musicTracks = [
  './music/music1.mp3',
  './music/music2.mp3',
  './music/music3.mp3',
  './music/music4.mp3',
  './music/music5.mp3',
  './music/music6.mp3'
];

let musicStarted = false;
let isMuted = false;
let musicPlayers = [];
let shuffledOrder = [];
let currentMusicIndex = 0;

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function initMusicPlayers() {
  musicPlayers = musicTracks.map(src => {
    const a = new Audio(src);
    a.preload = 'auto';
    a.muted = false;
    return a;
  });
  shuffledOrder = shuffleArray([...musicPlayers]);
  currentMusicIndex = 0;
  for (let i = 0; i < shuffledOrder.length; i++) {
    shuffledOrder[i].addEventListener('ended', () => {
      currentMusicIndex = (currentMusicIndex + 1) % shuffledOrder.length;
      shuffledOrder[currentMusicIndex].play();
    });
  }
}
initMusicPlayers();

const muteBtn = document.createElement('button');
muteBtn.innerText = 'Mute';
muteBtn.style.position = 'fixed';
muteBtn.style.top = '20px';
muteBtn.style.right = '20px';
muteBtn.style.zIndex = '999';
muteBtn.style.padding = '10px 20px';
muteBtn.style.fontSize = '16px';
muteBtn.style.cursor = 'pointer';
muteBtn.style.backgroundColor = 'rgba(0,0,0,0.5)';
muteBtn.style.color = 'white';
muteBtn.style.border = 'none';
muteBtn.style.borderRadius = '5px';
document.body.appendChild(muteBtn);
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  musicPlayers.forEach(a => { a.muted = isMuted; });
  muteBtn.innerText = isMuted ? 'Unmute' : 'Mute';
});

document.getElementById('startButton').addEventListener('click', () => {
  document.getElementById('startPage').style.display = 'none';
  startGame();
  if (!musicStarted && shuffledOrder.length > 0) {
    musicStarted = true;
    shuffledOrder[currentMusicIndex].play();
  }
});

let creakSound = new Audio('./music/creak.mp3');
creakSound.loop = true;

let currentSound = null;

function playSplash() {
  if (currentSound) { currentSound.pause(); currentSound.currentTime = 0; }
  currentSound = splashSound;
  currentSound.loop = false;
  currentSound.play();
}
function playCreak() {
  if (currentSound) { currentSound.pause(); currentSound.currentTime = 0; }
  currentSound = creakSound;
  currentSound.loop = true;
  currentSound.play();
}
function stopSound() {
  if (currentSound) { currentSound.pause(); currentSound.currentTime = 0; }
}

function startGame() {
  renderLoop();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate() {
  const delta = clock.getDelta();
  if (boatObject && floaters[controlledBoatId]) {
    creakSound.play()
    const currentFloater = floaters[controlledBoatId];
    const isMoving = keys.w || keys.a || keys.d;
    boatObject.getWorldPosition(boatPosition);
    const offWater = Math.abs(boatPosition.x) > waterExtent/2 || Math.abs(boatPosition.z) > waterExtent/2;

    if (offWater && !isFalling) {
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
        else { currentFloater.speed=0; currentFloater.power=0; currentFloater.heading=0; }
      }
    } else {
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
      floaters.forEach(f => f.update(delta));
      if (boatObject) {
        const targetY = currentFloater.object.position.y + boatHeightOffset - 2;
        boatObject.position.y += (targetY - boatObject.position.y) * 1;
      }
    }
    

    let targetCamPos = new THREE.Vector3();
    let targetLookAt = new THREE.Vector3();
    if (isMoving) {
      const offset = new THREE.Vector3(4,75,cameraZoomDistance);
      const rotMat = new THREE.Matrix4();
      rotMat.makeRotationFromQuaternion(boatRotation);
      const rotatedOffset = offset.clone().applyMatrix4(rotMat);
      targetCamPos.copy(boatPosition).add(rotatedOffset);
      targetLookAt.copy(boatPosition);
    } else {
      targetCamPos.copy(camera.position);
      targetLookAt.copy(boatPosition);
    }
    const lerpFac = 0.1;
    camera.position.lerp(targetCamPos, lerpFac);
    controls.target.lerp(targetLookAt, lerpFac);
    controls.enabled = !isMoving;
    controls.update();
  }

  renderer.render(scene, camera);
  gerstnerWater.update(delta);
}

function renderLoop() {
  requestAnimationFrame(renderLoop);
  animate();
}