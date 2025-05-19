
import * as THREE from "../three/build/three.module.js";
import { GLTFLoader } from "../three/examples/jsm/loaders/GLTFLoader.js";
import { GUI } from '/lil-gui.module.min.js';
import { OrbitControls } from "../three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "../three/examples/jsm/objects/Sky.js";

import GerstnerWater from "/gerstnerWater.js";
import Floater from "/floater.js";

let port = null; 
let reader = null;
let inputStreamDone = null;
let writer = null;

async function connectSerial() {
  try {
    if (!navigator.serial) {
      alert('Web Serial API not supported in this browser. Try Chrome or Edge.');
      return;
    }

    let selectedPort;
    try {
      selectedPort = await navigator.serial.requestPort();
    } catch (error) {
      if (error.name === 'NotFoundError') {
        console.log('No serial port selected by the user.');
        alert('No serial port selected. Please try again and choose a port.');
        return;
      } else {
        console.error('Error requesting serial port:', error);
        alert(`Error requesting serial port: ${error.message}`);
        return;
      }
    }

    if (!selectedPort) {
      console.log('No serial port selected by the user.');
      alert('No serial port selected. Please try again and choose a port.');
      return;
    }

    port = selectedPort;
    await port.open({ baudRate: 115200 });

    const textDecoder = new TextDecoderStream();
    inputStreamDone = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    outputStream = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    console.log('Serial port opened successfully!');
    startReading();

    port.addEventListener('disconnect', () => {
      console.log('Serial port disconnected.');
      disconnectSerial(); 
    });

  } catch (error) {
    console.error('Error opening serial port after selection:', error);
    alert(`Error opening serial port after selection: ${error.message}`);
  }
}

async function startReading() {
  while (port && port.readable) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        console.log('Input stream done.');
        break;
      }
      if (value) {
        const lines = value.split('\r\n'); 
        lines.forEach(line => {
          if (line.trim()) { 
            
            parseAndProcessData(line.trim()); 
          }
        });
      }
    } catch (error) {
      console.error('Error reading from serial port:', error);
      break;
    }
  }
}

function parseAndProcessData(line) {
  try {
    const trimmed = line.trim();
    const match = trimmed.match(/"?(pitch|roll)"?\s*:\s*(-?\d+(\.\d+)?)/i);

    if (match) {
      const key = match[1].toLowerCase();
      const parsedValue = parseFloat(match[2]);

      if (key === 'pitch') {
        handlePitchUpdate(parsedValue);
      } else if (key === 'roll') {
        handleRollUpdate(parsedValue);
      }
    }
  } catch (err) {
    console.error('Failed to parse line:', line, err);
  }
}

function handlePitchUpdate(pitchValue) {
  console.log('pitch:', pitchValue);
  let pitch = pitchValue;;

}
let forward = null;
function handleRollUpdate(rollValue) {
  console.log('roll:', rollValue);
  let roll = rollValue;
  if(roll >120){
    if(roll < 165){
         forward = true; 
    }else{forward = false;}
  }else{forward = false;}
}

async function sendSerialData(data) {
  if (writer && port && port.writable) {
    await writer.write(data + '\n'); // Assuming you want to send with a newline
  } else {
    console.log('Serial port not open or writable.');
  }
}

async function disconnectSerial() {
  if (reader) {
    await reader.cancel();
    await inputStreamDone.catch(() => {});
    reader.releaseLock();
    reader = null;
    inputStreamDone = null;
  }
  if (writer) {
    await writer.close();
    writer = null;
    outputStream = null;
  }
  if (port) {
    await port.close();
    port = null;
    console.log('Serial port closed.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startButton');
  startButton.addEventListener('click', connectSerial); // Connect connectSerial to the start button
});

let sinkingSpeed = 0.5;
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


let playerBoatModel;
let boatHeightOffset = -3;
let waterLevel = 0;
let playerBoatPosition = new THREE.Vector3();
let playerBoatRotation = new THREE.Quaternion();
let playerBoatObject = null;
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
const playerBoatGroup = new THREE.Group();
let initialBoatPosition = new THREE.Vector3();
let initialBoatRotation = new THREE.Quaternion();
const waterExtent = 5000;
const fallDepth = -75;
let isFalling = false;

gltfLoader.load("./ship/ship.glb", (gltf) => {
    playerBoatModel = gltf.scene;
    playerBoatModel.scale.set(0.8, 0.8, 0.8);
    playerBoatModel.position.y -= 1;
    playerBoatModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    playerBoatGroup.add(playerBoatModel);
    const floater = new Floater(earth, playerBoatGroup, gerstnerWater, false);
    floaters.push(floater);
    controlledBoatId = floaters.length - 1;
    playerBoatObject = playerBoatModel;
    playerBoatGroup.position.set(0, waterLevel + boatHeightOffset, -50);
    initialBoatPosition.copy(playerBoatGroup.position);
    initialBoatRotation.copy(playerBoatGroup.quaternion);
    earth.add(playerBoatGroup);
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
sky.scale.setScalar(20000);
scene.add(sky);
const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0.005;


const parameters = {
    elevation: 2,
    azimuth: 180
};


const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad( 90 - parameters.elevation );
const theta = THREE.MathUtils.degToRad( parameters.azimuth );

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

function playSplash(splashSound) {
    if (currentSound) { currentSound.pause(); currentSound.currentTime = 0; }
    currentSound = splashSound;
    currentSound.loop = false;
    currentSound.play();
}

function startGame() {
    loadOpponentShips(2);
    loadSailboats(2);
    loadSailships(2);
    renderLoop();
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

const opponentShips = [];
const sailboats = [];
const sailships = [];

function loadOpponentShips(count) {
    for (let i = 0; i < count; i++) {
        gltfLoader.load("./boats/oppShip.glb", (gltf) => {
            const model = gltf.scene;
            model.scale.set(5, 5, 5);
            model.position.y -= 1;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const group = new THREE.Group();
            group.add(model);
            const x = (Math.random() - 0.5) * waterExtent * 0.8;
            const z = (Math.random() - 0.5) * waterExtent * 0.8;
            group.position.set(x, waterLevel + boatHeightOffset, z);
            group.rotation.y = Math.random() * Math.PI * 2;
            earth.add(group);
            const floater = new Floater(earth, group, gerstnerWater, true);
            floaters.push(floater);
            opponentShips.push({ group: group, floater: floater, model: model, hitCount: 0, sinking: false });
        });
    }
}

function loadSailboats(count) {
    for (let i = 0; i < count; i++) {
        gltfLoader.load("./boats/sailboat.glb", (gltf) => {
            const model = gltf.scene;
            model.scale.set(30, 30, 30);
            model.position.y -= 0.5;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const group = new THREE.Group();
            group.add(model);
            const x = (Math.random() - 0.5) * waterExtent * 0.8;
            const z = (Math.random() - 0.5) * waterExtent * 0.8;
            group.position.set(x, waterLevel + boatHeightOffset, z);
            group.rotation.y = Math.random() * Math.PI * 2;
            earth.add(group);
            const floater = new Floater(earth, group, gerstnerWater, true);
            floaters.push(floater);
            sailboats.push({ group: group, floater: floater, model: model, hitCount: 0, sinking: false });
        });
    }
}

function loadSailships(count) {
    for (let i = 0; i < count; i++) {
        gltfLoader.load("./boats/sailship.glb", (gltf) => {
            const model = gltf.scene;
            model.scale.set(10, 10, 10);
            model.position.y -= 1.2;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const group = new THREE.Group();
            group.add(model);
            const x = (Math.random() - 0.5) * waterExtent * 0.8;
            const z = (Math.random() - 0.5) * waterExtent * 0.8;
            group.position.set(x, waterLevel + boatHeightOffset, z);
            group.rotation.y = Math.random() * Math.PI * 2;
            earth.add(group);
            const floater = new Floater(earth, group, gerstnerWater, true);
            floaters.push(floater);
            sailships.push({ group: group, floater: floater, model: model, hitCount: 0, sinking: false });
        });
    }
}



function animate() {
    const delta = clock.getDelta();
    if (playerBoatObject && floaters[controlledBoatId]) {
        creakSound.play();
        const currentFloater = floaters[controlledBoatId];
        const isMoving = keys.w || keys.a || keys.d;
        playerBoatObject.getWorldPosition(playerBoatPosition);
        const offWater = Math.abs(playerBoatPosition.x) > waterExtent / 2 || Math.abs(playerBoatPosition.z) > waterExtent / 2;

        if (offWater && !isFalling) {
            isFalling = true;
            currentSpeed = 0;
        }

        if (isFalling) {
            playerBoatGroup.position.y -= 10 * delta;
            if (playerBoatGroup.position.y < fallDepth) {
                isFalling = false;
                playerBoatGroup.position.copy(initialBoatPosition);
                playerBoatGroup.quaternion.copy(initialBoatRotation);
                if (typeof currentFloater.reset === 'function') currentFloater.reset();
                else { currentFloater.speed = 0; currentFloater.power = 0; currentFloater.heading = 0; }
            }
        } else {
            if (keys.w || forward) {
                currentFloater.power = Math.max(currentFloater.power - 0.1, -4);
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
                playerBoatObject.rotation.y += rotateSpeed;
                currentFloater.heading += 0.015;
            } else if (keys.d) {
                playerBoatObject.rotation.y -= rotateSpeed;
                currentFloater.heading -= 0.015;
            }
            playerBoatObject.getWorldQuaternion(playerBoatRotation);

            // Update all floaters, including opponent ships, sailboats, and sailships
            floaters.forEach(floater => floater.update(delta));

            if (playerBoatObject) {
                const targetY = currentFloater.object.position.y + boatHeightOffset - 2;
                playerBoatObject.position.y += (targetY - playerBoatObject.position.y) * 1;
            }
        }


        let targetCamPos = new THREE.Vector3();
        let targetLookAt = new THREE.Vector3();

        if (isMoving || forward) {
            const offset = new THREE.Vector3(4, 65, cameraZoomDistance);
            const rotMat = new THREE.Matrix4();
            rotMat.makeRotationFromQuaternion(playerBoatRotation);
            const rotatedOffset = offset.clone().applyMatrix4(rotMat);
            targetCamPos.copy(playerBoatPosition).add(rotatedOffset);
            targetLookAt.copy(playerBoatPosition);
        } else {
            targetCamPos.copy(camera.position);
            targetLookAt.copy(playerBoatPosition);
        }
        const lerpFac = 0.1;
        camera.position.lerp(targetCamPos, lerpFac);
        controls.target.lerp(targetLookAt, lerpFac);
        controls.enabled = !isMoving;
        controls.update();

        if (!window.cannonballs) window.cannonballs = [];
        if (!window.cannonCooldown) window.cannonCooldown = 0;


        document.onkeydown = function (e) {
            if (e.code === 'Space' && window.cannonCooldown <= 0 && playerBoatObject) {
                playSplash(new Audio('./music/splash.mp3'));
                const geometry = new THREE.SphereGeometry(1, 16, 16);
                const material = new THREE.MeshStandardMaterial({ color: 0x222222 });
                const cannonball = new THREE.Mesh(geometry, material);
                cannonball.castShadow = true;
                cannonball.receiveShadow = true;


                const boatWorldPos = new THREE.Vector3();
                const boatWorldQuat = new THREE.Quaternion();
                playerBoatObject.getWorldPosition(boatWorldPos);
                playerBoatObject.getWorldQuaternion(boatWorldQuat);


                const sideOffset = new THREE.Vector3(10, 5, 0);
                sideOffset.applyQuaternion(boatWorldQuat);


                cannonball.position.copy(boatWorldPos).add(sideOffset);

                const velocity = new THREE.Vector3(5, 3.5, 0);
                velocity.applyQuaternion(playerBoatObject.quaternion);
                velocity.multiplyScalar(10);

                window.cannonballs.push({ mesh: cannonball, velocity, alive: true, life: 0 });
                scene.add(cannonball);

                window.cannonCooldown = 0.5;
            }
        };


        for (let i = window.cannonballs.length - 1; i >= 0; i--) {
            const cb = window.cannonballs[i];
            if (!cb.alive) continue;
            cb.mesh.position.addScaledVector(cb.velocity, delta);
            cb.velocity.y -= 9.8 * delta * 2;
            cb.life += delta;

            
            let collision = false;
            let hitBoat = null;
            let boatType = null;

            for (let j = 0; j < opponentShips.length; j++) {
                const enemyBoat = opponentShips[j];
                const distance = cb.mesh.position.distanceTo(enemyBoat.group.position);
                if (distance < 100) { 
                    collision = true;
                    hitBoat = enemyBoat;
                    boatType = 'opponentShips';
                    break;
                }
            }
            if (!collision) {
                for (let j = 0; j < sailboats.length; j++) {
                    const enemyBoat = sailboats[j];
                    const distance = cb.mesh.position.distanceTo(enemyBoat.group.position);
                    if (distance < 100) {
                        collision = true;
                        hitBoat = enemyBoat;
                        boatType = 'sailboats';
                        break;
                    }
                }
            }
            if (!collision) {
                for (let j = 0; j < sailships.length; j++) {
                    const enemyBoat = sailships[j];
                    const distance = cb.mesh.position.distanceTo(enemyBoat.group.position);
                    if (distance < 100) {
                        collision = true;
                        hitBoat = enemyBoat;
                        boatType = 'sailships';
                        break;
                    }
                }
            }


            if (collision) {

                if (hitBoat) {
                    hitBoat.hitCount++;
                    if (hitBoat.hitCount >= 3) {
                        hitBoat.sinking = true;
                        scene.remove(hitBoat.group); // Remove boat from scene.
                        // Remove the boat from its respective array
                        if (boatType === 'opponentShips') {
                            opponentShips.splice(opponentShips.indexOf(hitBoat), 1);
                        } else if (boatType === 'sailboats') {
                            sailboats.splice(sailboats.indexOf(hitBoat), 1);
                        } else if (boatType === 'sailships') {
                            sailships.splice(sailships.indexOf(hitBoat), 1);
                        }
                    }
                }
            }


            if (cb.mesh.position.y < waterLevel - 10 || cb.life > 8) {
                scene.remove(cb.mesh);
                cb.alive = false;
                window.cannonballs.splice(i, 1);
            }
        }


        if (window.cannonCooldown > 0) window.cannonCooldown -= delta;
    }

    renderer.render(scene, camera);
    gerstnerWater.update(delta);
}



function renderLoop() {
    requestAnimationFrame(renderLoop);
    animate();
}
