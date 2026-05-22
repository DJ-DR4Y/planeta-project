// Scene data loaded from scenes.json — see async function init()

// UI Elements
const timeDisplay = document.getElementById('timeDisplay');
const sceneTitle = document.getElementById('sceneTitle');
const actionText = document.getElementById('actionText');
const overlayPlayBtn = document.getElementById('overlayPlayBtn');
const overlayNextBtn = document.getElementById('overlayNextBtn');
const promptsList = document.getElementById('promptsList');
const container = document.getElementById('playerContainer');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenIcon = document.getElementById('fullscreenIcon');

let playUntil = 30; // Limits playback if a single scene is selected

async function init() {
  // Progress bar helpers
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingBarFill = document.getElementById('loadingBarFill');
  const loadingPercent = document.getElementById('loadingPercent');
  let loadedSteps = 0;
  const totalSteps = 5; // 4 GLSL shaders + scenes.json
  function onAssetLoaded() {
    loadedSteps++;
    const pct = Math.round((loadedSteps / totalSteps) * 100);
    if (loadingBarFill) loadingBarFill.style.width = pct + '%';
    if (loadingPercent) loadingPercent.textContent  = pct + '%';
  }

  // Load shaders + scene data in parallel (requires a local HTTP server)
  const [earthVertSrc, earthFragSrc, starsVertSrc, starsFragSrc, scenesData] = await Promise.all([
    fetch('./shaders/earth/vertex.glsl').then(r => r.text()).then(v  => { onAssetLoaded(); return v; }),
    fetch('./shaders/earth/fragment.glsl').then(r => r.text()).then(v => { onAssetLoaded(); return v; }),
    fetch('./shaders/stars/vertex.glsl').then(r => r.text()).then(v  => { onAssetLoaded(); return v; }),
    fetch('./shaders/stars/fragment.glsl').then(r => r.text()).then(v => { onAssetLoaded(); return v; }),
    fetch('./scenes.json').then(r => r.json()).then(v               => { onAssetLoaded(); return v; }),
  ]);
  const scenes    = scenesData.scenes;
  const uiStrings = scenesData.ui;

  // Detect browser language; fall back to 'en' if unsupported
  const supportedLangs = Object.keys(scenes[0].title);
  const langMeta = { en: '\u{1F1FA}\u{1F1F8} EN', fr: '\u{1F1EB}\u{1F1F7} FR', es: '\u{1F1EA}\u{1F1F8} ES' };
  let currentLang = supportedLangs.includes(navigator.language.slice(0, 2))
    ? navigator.language.slice(0, 2)
    : 'en';
  const langToggleBtn = document.getElementById('langToggleBtn');
  if (langToggleBtn) langToggleBtn.textContent = langMeta[currentLang] || currentLang.toUpperCase();
  document.documentElement.lang = currentLang;

// Populate Prompts — rebuilt on each language change
  function buildCards() {
    promptsList.innerHTML = '';
    scenes.forEach(scene => {
      const card = document.createElement('div');
      card.className = 'prompt-card';
      card.id = `card-${scene.id}`;
      card.innerHTML = `
        <div class="prompt-title">${scene.id}. ${scene.title[currentLang]} (${scene.start}-${scene.end}s)</div>
        <div class="prompt-text">${scene.prompt[currentLang]}</div>
      `;
      card.addEventListener('click', () => {
        currentTime = scene.start;
        playUntil = scene.end;
        isPlaying = true;
        updatePlayButtons(uiStrings.pause[currentLang]);
        clock.start();
      });
      promptsList.appendChild(card);
    });
  }
  buildCards();

// Procedural Planet Shader Material — biomes without UV seam
function createPlanetMaterial(vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:              { value: 0.0 },
      uEmissiveColor:     { value: new THREE.Color(0x001122) },
      uEmissiveIntensity: { value: 0.0 },
      uColorMult:         { value: new THREE.Color(1, 1, 1) }
    },
    vertexShader,
    fragmentShader,
    lights: false
  });
}

// Procedural Text Texture for DR4Y
function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.font = 'bold 160px "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 30;

  ctx.fillText(text, 512, 128);
  ctx.shadowBlur = 10;
  ctx.fillText(text, 512, 128); // double draw for solid core

  return new THREE.CanvasTexture(canvas);
}

// Mobile & device detection
const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// WebGL availability check
function isWebGLAvailable() {
  try {
    const t = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (t.getContext('webgl') || t.getContext('experimental-webgl')));
  } catch (e) { return false; }
}
if (!isWebGLAvailable()) {
  document.getElementById('webgl-error').style.display = 'flex';
  throw new Error('WebGL not supported');
}

// Three.js Setup
const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x001219, 0.008);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// PCFSoftShadowMap: softer shadow edges, good quality/perf balance
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Global Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
// Cast shadows — affects MeshStandard/Lambert objects only
// (ShaderMaterial with lights:false and additive blends are unaffected)
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width  = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far  = 50;
directionalLight.shadow.camera.left   = -10;
directionalLight.shadow.camera.right  =  10;
directionalLight.shadow.camera.top    =  10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

// --- Object Groups ---
const planetGroup = new THREE.Group();
const crystalGroup = new THREE.Group();
const ringGroup = new THREE.Group();
const tunnelGroup = new THREE.Group();
const starGroup = new THREE.Group();
const explosionGroup = new THREE.Group();

scene.add(planetGroup);
scene.add(crystalGroup);
scene.add(ringGroup);
scene.add(tunnelGroup);
scene.add(starGroup);
scene.add(explosionGroup);

// 3D Background Stars (Visible in Scenes 1, 2, 3, 4)
const starsCount = isMobile ? 1500 : 4000;
const starsGeo = new THREE.BufferGeometry();
const starsPosArray = new Float32Array(starsCount * 3);
const starsColorArray = new Float32Array(starsCount * 3);
const starsSizeArray = new Float32Array(starsCount);

// Star color palette: white, warm yellow, cool blue
const starColors = [
  new THREE.Color(0xffffff), // White
  new THREE.Color(0xfff4cc), // Warm yellow
  new THREE.Color(0xcce0ff), // Cool blue
  new THREE.Color(0x00E5FF),  // Cyan accent
];

for (let i = 0; i < starsCount; i++) {
  const i3 = i * 3;
  const u = Math.random();
  const v = Math.random();
  const theta = u * 2.0 * Math.PI;
  const phi = Math.acos(2.0 * v - 1.0);
  const r = 15 + Math.random() * 15;

  starsPosArray[i3]     = r * Math.sin(phi) * Math.cos(theta);
  starsPosArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starsPosArray[i3 + 2] = r * Math.cos(phi);

  const colorIndex = Math.random() < 0.05 ? 3 : Math.floor(Math.random() * 3);
  const color = starColors[colorIndex];
  starsColorArray[i3]     = color.r;
  starsColorArray[i3 + 1] = color.g;
  starsColorArray[i3 + 2] = color.b;

  // Random size variation — 70% small, 25% medium, 5% bright
  const sizeRand = Math.random();
  starsSizeArray[i] = sizeRand < 0.70
    ? 0.4 + Math.random() * 0.4
    : sizeRand < 0.95
      ? 0.8 + Math.random() * 0.7
      : 1.5 + Math.random() * 1.0;
}

starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPosArray, 3));
starsGeo.setAttribute('color',    new THREE.BufferAttribute(starsColorArray, 3));
starsGeo.setAttribute('size',     new THREE.BufferAttribute(starsSizeArray, 1));

const starsMat = new THREE.ShaderMaterial({
  uniforms: {
    uScale:   { value: 1.0 },
    uOpacity: { value: 1.0 }
  },
  vertexShader: starsVertSrc,
  fragmentShader: starsFragSrc,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const backgroundStars = new THREE.Points(starsGeo, starsMat);
starGroup.add(backgroundStars);

// 1 & 2. Planet OVA (Origin & Unstable Phase)
// IcosahedronGeometry: uniform triangle distribution, no polar pinching, ideal for procedural shaders
const planetGeo = new THREE.IcosahedronGeometry(2.5, 12);
const planetMat = createPlanetMaterial(earthVertSrc, earthFragSrc);
const planet = new THREE.Mesh(planetGeo, planetMat);

// Atmosphere/Clouds for planet
const atmosGeo = new THREE.IcosahedronGeometry(2.57, 12);
const atmosMat = new THREE.MeshLambertMaterial({
  color: 0x00E5FF,
  transparent: true,
  opacity: 0.35,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending
});
const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);

planetGroup.add(planet);
planetGroup.add(atmosphere);

// Wireframe ghost planet — Scene 4 "data reconstruction" effect
// Low-detail icosahedron (detail 4 = 1280 faces) gives a readable geodesic grid
const planetWireGeo = new THREE.IcosahedronGeometry(2.5, 4);
const planetWireMat = new THREE.MeshBasicMaterial({
  color: 0x00E5FF,
  wireframe: true,
  transparent: true,
  opacity: 0.55
});
const planetWire = new THREE.Mesh(planetWireGeo, planetWireMat);
planetWire.visible = false;
planetGroup.add(planetWire);

// Threat Light
const threatLight = new THREE.PointLight(0xff0000, 0, 15);
threatLight.position.set(2, 2, 3);
planetGroup.add(threatLight);

// Planet Shatter Debris (Scene 2 Explosion Elements)
const fragments = [];
const fragmentCount = 120;
const fragGeo = new THREE.DodecahedronGeometry(0.15, 0);
const fragMat = new THREE.MeshStandardMaterial({
  color: 0x0a5b75,
  emissive: 0xff3300,
  emissiveIntensity: 1.5,
  roughness: 0.9,
  metalness: 0.1
});

for (let i = 0; i < fragmentCount; i++) {
  const mesh = new THREE.Mesh(fragGeo, fragMat.clone());
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  explosionGroup.add(mesh);

  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos((Math.random() * 2) - 1);
  const velocity = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi)
  );
  const speed = 2.5 + Math.random() * 8.5;
  velocity.multiplyScalar(speed);

  fragments.push({
    mesh: mesh,
    velocity: velocity,
    rotationSpeed: new THREE.Vector3(
      Math.random() * 5,
      Math.random() * 5,
      Math.random() * 5
    )
  });
}

// 3. Memory Atoms & Orbital Systems
const atomSystems = [];
const nucleusGeo = new THREE.OctahedronGeometry(0.5);
const nucleusMat = new THREE.MeshStandardMaterial({
  color: 0x00E5FF,
  emissive: 0x005577,
  roughness: 0.1,
  metalness: 0.9,
  transparent: true,
  opacity: 0.95
});

for (let i = 0; i < 3; i++) {
  const atomGroup = new THREE.Group();
  const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
  nucleus.castShadow    = true;
  nucleus.receiveShadow = true;
  atomGroup.add(nucleus);

  const orbits = [];
  for (let j = 0; j < 3; j++) {
    const orbitRadius = 1.0 + j * 0.4;
    const ringGeo = new THREE.RingGeometry(orbitRadius, orbitRadius + 0.02, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x003344,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.random() * Math.PI * 16;
    ring.rotation.y = Math.random() * Math.PI * 4;
    ring.rotation.z = Math.random() * Math.PI * 8;
    atomGroup.add(ring);

    const electronGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const electronMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const electron = new THREE.Mesh(electronGeo, electronMat);
    atomGroup.add(electron);

    orbits.push({
      ring: ring,
      electron: electron,
      radius: orbitRadius,
      speed: 2.0 + Math.random() * 6.0,
      angleOffset: Math.random() * Math.PI * 2
    });
  }

  atomGroup.position.set(
    (i - 1) * 3.5,
    (Math.random() - 0.5) * 1.0,
    (Math.random() - 0.5) * 1.0
  );

  crystalGroup.add(atomGroup);
  atomSystems.push({
    group: atomGroup,
    nucleus: nucleus,
    orbits: orbits,
    yOffset: Math.random() * Math.PI * 2
  });
}

// Scene 3: Futuristic archive room ─ floor, walls, human bust
// All in wireframe to feel like a digital data environment
const roomMat = new THREE.MeshBasicMaterial({
  color: 0x0a3a5c, wireframe: true, transparent: true, opacity: 0.5
});

// Floor — large grid plane stretching into the depth ("infinite" with fog)
const roomFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 80, 36, 80), roomMat
);
roomFloor.rotation.x = -Math.PI / 2;
roomFloor.position.set(0, -6, -45);
crystalGroup.add(roomFloor);

// Left wall
const roomWallL = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 36, 80, 36),
  new THREE.MeshBasicMaterial({ color: 0x0a3a5c, wireframe: true, transparent: true, opacity: 0.25 })
);
roomWallL.rotation.y = Math.PI / 2;
roomWallL.position.set(-18, 12, -45);
crystalGroup.add(roomWallL);

// Right wall
const roomWallR = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 36, 80, 36),
  new THREE.MeshBasicMaterial({ color: 0x0a3a5c, wireframe: true, transparent: true, opacity: 0.25 })
);
roomWallR.rotation.y = -Math.PI / 2;
roomWallR.position.set(18, 12, -45);
crystalGroup.add(roomWallR);

// Human bust wireframe silhouette — small figure in the background,
// facing the archive data (atom systems in foreground)
const siMat = new THREE.MeshBasicMaterial({
  color: 0x00D4FF, wireframe: true, transparent: true, opacity: 0.5
});
const silhouetteGroup = new THREE.Group();
silhouetteGroup.position.set(0, -1.0, 7.0);
silhouetteGroup.scale.setScalar(0.40);

// Head
const siHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), siMat);
siHead.position.set(0, 2.2, 0);
silhouetteGroup.add(siHead);

// Neck
const siNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.25, 7), siMat);
siNeck.position.set(0, 1.82, 0);
silhouetteGroup.add(siNeck);

// Chest / torso (bust only — cut at lower chest)
const siChest = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.82, 0.30), siMat);
siChest.position.set(0, 1.27, 0);
silhouetteGroup.add(siChest);

// Left shoulder / upper arm
const siArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.48, 6), siMat);
siArmL.rotation.z = Math.PI * 0.62;
siArmL.position.set(-0.62, 1.50, 0);
silhouetteGroup.add(siArmL);

// Right shoulder / upper arm
const siArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.48, 6), siMat);
siArmR.rotation.z = -Math.PI * 0.62;
siArmR.position.set(0.62, 1.50, 0);
silhouetteGroup.add(siArmR);

crystalGroup.add(silhouetteGroup);

// 4. Ring Structure (Planeta Core)
const coreRingMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x00E5FF, emissiveIntensity: 0.8, roughness: 0.1, metalness: 1.0
});
const wireRingMat = new THREE.MeshBasicMaterial({
  color: 0x00E5FF, wireframe: true, transparent: true, opacity: 0.5
});

const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3, 0.15, 32, 100), coreRingMat);
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4, 0.05, 32, 100), wireRingMat);
const ring3 = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.08, 32, 100), coreRingMat);
// ring1/ring3 use MeshStandardMaterial — cast shadows on each other
ring1.castShadow = true; ring1.receiveShadow = true;
ring3.castShadow = true; ring3.receiveShadow = true;

ring1.rotation.x = Math.PI / 2;
ring2.rotation.x = Math.PI / 4;
ring3.rotation.x = Math.PI / 8;

ringGroup.add(ring1);
ringGroup.add(ring2);
ringGroup.add(ring3);

// Core Particle Energy Beam
const beamParticleCount = isMobile ? 1500 : 5000;
const beamParticlesGeo = new THREE.BufferGeometry();
const beamPosArray = new Float32Array(beamParticleCount * 3);
const beamSpeeds = [];

for (let i = 0; i < beamParticleCount * 3; i += 3) {
  const radius = Math.random() * 0.7;
  const theta = Math.random() * Math.PI * 2;
  const y = (Math.random() - 0.5) * 20;

  beamPosArray[i]     = Math.cos(theta) * radius;
  beamPosArray[i + 1] = y;
  beamPosArray[i + 2] = Math.sin(theta) * radius;

  beamSpeeds.push(4.0 + Math.random() * 8.0);
}
beamParticlesGeo.setAttribute('position', new THREE.BufferAttribute(beamPosArray, 3));
const beamParticleMat = new THREE.PointsMaterial({
  size: 0.10,
  color: 0x00E5FF,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true
});
const beamParticleSystem = new THREE.Points(beamParticlesGeo, beamParticleMat);
ringGroup.add(beamParticleSystem);

// 5. Fractal Energy Tunnel (Particles)
const particlesGeo = new THREE.BufferGeometry();
const particleCount = isMobile ? 600 : 2000;
const posArray = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount * 3; i += 3) {
  const radius = 2 + Math.random() * 3;
  const theta = Math.random() * Math.PI * 2;
  const z = (Math.random() - 0.5) * 40;

  posArray[i]     = Math.cos(theta) * radius;
  posArray[i + 1] = Math.sin(theta) * radius;
  posArray[i + 2] = z;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMat = new THREE.PointsMaterial({
  size: 0.05,
  color: 0x00E5FF,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending
});
const particleSystem = new THREE.Points(particlesGeo, particleMat);
tunnelGroup.add(particleSystem);

// 3D Text "DR4Y"
const textGeo = new THREE.PlaneGeometry(12, 3);
const textMat = new THREE.MeshBasicMaterial({
  map: createTextTexture("DR4Y"),
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const dr4yText = new THREE.Mesh(textGeo, textMat);
tunnelGroup.add(dr4yText);

// 3D logo model — loads in background, appears in Scene 5 tunnel
let logoModel     = null;
let logoBaseScale = 1;

// Point light that follows the logo — illuminates its surface material
// decay:0 = no falloff formula, light spreads uniformly up to 'distance'
const logoLight     = new THREE.PointLight(0xffffff, 0.5, 60, 0);
const logoFillLight = new THREE.PointLight(0x88ccff, 0.5, 60, 0); // cool fill from behind
logoLight.visible     = false;
logoFillLight.visible = false;
tunnelGroup.add(logoLight);
tunnelGroup.add(logoFillLight);
new THREE.GLTFLoader().load(
  './models_3D/model.glb',
  (gltf) => {
    logoModel = gltf.scene;
    // Normalise to 2.5 units along its longest axis
    const box    = new THREE.Box3().setFromObject(logoModel);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    logoBaseScale = 4 / Math.max(size.x, size.y, size.z);
    logoModel.traverse(child => {
      if (!child.isMesh) return;
      child.material             = child.material.clone();
      child.material.transparent = false;
      // child.material.depthWrite  = false;
      child.material.opacity     = 0;
    });
    logoModel.scale.setScalar(logoBaseScale);
    // Centrer le modèle : compenser le décalage de son bounding box
    logoModel.position.set(
      -center.x * logoBaseScale,
      -center.y * logoBaseScale,
      -2 - center.z * logoBaseScale
    );
    tunnelGroup.add(logoModel);
  },
  undefined,
  (err) => console.warn('DR4Y logo model failed to load:', err)
);

function handleResize() {
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  // iOS Safari 100vh fix
  document.documentElement.style.setProperty('--app-height', height + 'px');
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // Scale star size proportionally to screen height so they look consistent in fullscreen
  starsMat.uniforms.uScale.value = Math.max(1.0, height / 400) * window.devicePixelRatio;
}

window.addEventListener('resize', handleResize);

// Pseudo-Fullscreen Toggle Fallback
function togglePseudoFullscreen() {
  const isPseudo = container.classList.toggle('fullscreen-fallback');
  if (isPseudo) {
    fullscreenIcon.innerHTML = `
      <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else {
    fullscreenIcon.innerHTML = `
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  setTimeout(handleResize, 100);
}

// Fullscreen Toggle functionality
fullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (!isFullscreen && !container.classList.contains('fullscreen-fallback')) {
    // Try standard fullscreen (with webkit prefix for Safari macOS)
    const requestFS = container.requestFullscreen || container.webkitRequestFullscreen;
    if (requestFS) {
      Promise.resolve(requestFS.call(container))
        .then(() => { setTimeout(handleResize, 100); })
        .catch(() => { togglePseudoFullscreen(); });
    } else {
      togglePseudoFullscreen();
    }
  } else {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exitFS = document.exitFullscreen || document.webkitExitFullscreen;
      Promise.resolve(exitFS.call(document)).finally(() => { setTimeout(handleResize, 100); });
    } else if (container.classList.contains('fullscreen-fallback')) {
      togglePseudoFullscreen();
    }
  }
});

// Esc key to exit pseudo-fullscreen mode
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && container.classList.contains('fullscreen-fallback')) {
    togglePseudoFullscreen();
  }
});

// Listen for fullscreen changes (with webkit prefix for Safari)
function handleFullscreenChange() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    fullscreenIcon.innerHTML = `
      <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else {
    fullscreenIcon.innerHTML = `
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  setTimeout(handleResize, 100);
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

let isPlaying = false;
let currentTime = 0;
let clock = new THREE.Clock();

// Hide all initially
planetGroup.visible = false;
crystalGroup.visible = false;
ringGroup.visible = false;
tunnelGroup.visible = false;
starGroup.visible = true;
explosionGroup.visible = false;

function updateUI(time) {
  const currentScene = scenes.find(s => time >= s.start && time < s.end) || scenes[scenes.length - 1];

  // Format time (MM:SS:FF) 24fps
  const seconds = Math.floor(time).toString().padStart(2, '0');
  const frames = Math.floor((time % 1) * 24).toString().padStart(2, '0');
  timeDisplay.innerText = `00:00:${seconds}:${frames}`;

  sceneTitle.innerText = `${currentScene.id}. ${currentScene.title[currentLang]}`;
  actionText.innerText = currentScene.action[currentLang];

  // Highlight active card
  document.querySelectorAll('.prompt-card').forEach(card => card.classList.remove('active'));
  const activeCard = document.getElementById(`card-${currentScene.id}`);
  if (activeCard) activeCard.classList.add('active');

  // Handle UI Glitch in Scene 2
  if (currentScene.id === 2) {
    timeDisplay.classList.add('ui-glitch');
    sceneTitle.innerText = uiStrings.systemFailure[currentLang];
  } else {
    timeDisplay.classList.remove('ui-glitch');
  }

  return currentScene.id;
}

function updatePlayButtons(text) {
  overlayPlayBtn.innerText = text;
}

function playNextScene() {
  const currentScene = scenes.find(s => currentTime >= s.start && currentTime < s.end) || scenes[scenes.length - 1];
  let nextIndex = scenes.indexOf(currentScene) + 1;
  if (nextIndex >= scenes.length) nextIndex = 0; // Wrap around to Scene 1

  currentTime = scenes[nextIndex].start;
  playUntil = scenes[nextIndex].end;
  isPlaying = true;
  updatePlayButtons(uiStrings.pause[currentLang]);
  clock.start();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  planetMat.uniforms.uTime.value += delta;

  if (isPlaying) {
    currentTime += delta;

    // Stop if we reached the target 'playUntil' time
    if (currentTime >= playUntil) {
      currentTime = playUntil;
      isPlaying = false;
      const endOfShow = playUntil >= 30;
      updatePlayButtons(endOfShow ? uiStrings.replay[currentLang] : uiStrings.restart[currentLang]);
      if (playUntil >= 30) playUntil = 30;
    }

    const activeSceneId = updateUI(currentTime);

    // Reset scene visibility
    planetGroup.visible = false;
    crystalGroup.visible = false;
    ringGroup.visible = false;
    tunnelGroup.visible = false;
    starGroup.visible = true;
    explosionGroup.visible = false;

    // Scene 1-4: Display Starfield (Slow spin + twinkle)
    if (activeSceneId !== 6) {
      starGroup.visible = true;
      backgroundStars.rotation.y += 0.001;
      backgroundStars.rotation.x += 0.0005;
      starsMat.uniforms.uOpacity.value = 0.9 + Math.sin(elapsedTime * 1.5) * 0.1;
    }

    // Scene 1: Origin
    if (activeSceneId === 1) {
      planetGroup.visible = true;
      camera.position.z = 10 - (currentTime * 0.5);
      planet.rotation.y += 0.003;
      planet.scale.set(1, 1, 1);
      atmosphere.scale.set(1, 1, 1);
      planetMat.uniforms.uColorMult.value.setRGB(1, 1, 1);
      planetMat.uniforms.uEmissiveColor.value.setHex(0x001122);
      planetMat.uniforms.uEmissiveIntensity.value = 0.0;
      threatLight.intensity = 0;
    }

    // Scene 2: Threat (With realistic planet shatter explosion)
    if (activeSceneId === 2) {
      const scene2Time = currentTime - 3;
      camera.position.z = 8;
      camera.position.x = (Math.random() - 0.5) * 0.15;
      camera.position.y = (Math.random() - 0.5) * 0.15;

      if (scene2Time < 1.8) {
        planetGroup.visible = true;
        planet.rotation.y += 0.015;
        planet.scale.set(1, 1, 1);
        atmosphere.scale.set(1 + scene2Time * 0.08, 1 + scene2Time * 0.08, 1 + scene2Time * 0.08);
        planetMat.uniforms.uColorMult.value.setRGB(1.0, 0.25, 0.18);
        planetMat.uniforms.uEmissiveColor.value.setHex(0xaa0000);
        planetMat.uniforms.uEmissiveIntensity.value = 1.5 + Math.sin(elapsedTime * 35) * 1.0;
        threatLight.intensity = 15 + Math.sin(elapsedTime * 35) * 12;
        fragments.forEach(f => {
          f.mesh.scale.set(0, 0, 0);
          f.mesh.position.set(0, 0, 0);
        });
      } else {
        explosionGroup.visible = true;
        const explodeProgress = scene2Time - 1.8;
        planet.scale.set(0, 0, 0);
        atmosphere.scale.set(0, 0, 0);
        fragments.forEach(f => {
          const scale = Math.max(1.0 - (explodeProgress * 0.45), 0);
          f.mesh.scale.set(scale, scale, scale);
          f.mesh.position.copy(f.velocity).multiplyScalar(explodeProgress * 0.45);
          f.mesh.rotation.x += f.rotationSpeed.x * delta;
          f.mesh.rotation.y += f.rotationSpeed.y * delta;
          f.mesh.material.emissiveIntensity = Math.max(2.0 - (explodeProgress * 0.9), 0);
        });
      }
    } else {
      camera.position.x = 0;
      camera.position.y = 0;
      planetMat.uniforms.uColorMult.value.setRGB(1, 1, 1);
      planetMat.uniforms.uEmissiveColor.value.setHex(0x001122);
      planetMat.uniforms.uEmissiveIntensity.value = 0.0;
    }

    // Scene 3: Humanity (Atomic orbital simulation)
    if (activeSceneId === 3) {
      crystalGroup.visible = true;
      camera.position.z = 8;
      atomSystems.forEach(sys => {
        sys.group.rotation.y += 0.005;
        sys.nucleus.rotation.x += 0.01;
        sys.nucleus.rotation.z += 0.01;
        sys.group.position.y += Math.sin(elapsedTime * 2 + sys.yOffset) * 0.003;
        sys.orbits.forEach(orb => {
          const angle = elapsedTime * orb.speed + orb.angleOffset;
          const localPos = new THREE.Vector3(Math.cos(angle) * orb.radius, Math.sin(angle) * orb.radius, 0);
          localPos.applyEuler(orb.ring.rotation);
          orb.electron.position.copy(localPos);
        });
      });
      // Silhouette slow pulse — breathing / data-scan rhythm
      siMat.opacity = 0.50 + Math.sin(elapsedTime * 1.4) * 0.22;
      // Subtle head tilt toward the archive
      silhouetteGroup.rotation.x = Math.sin(elapsedTime * 0.4) * 0.04;
    }

    // Scene 4: Activation (Gyroscopic Rings + Spiraling Particles)
    if (activeSceneId === 4) {
      planetGroup.visible = true;
      ringGroup.visible = true;
      camera.position.z = 15;

      // Show wireframe ghost instead of textured planet:
      // conveys the idea that OVA is being re-assembled from stored data
      planet.visible = false;
      atmosphere.visible = false;
      planetWire.visible = true;
      planetWire.rotation.y += 0.003;
      // Slow pulse on opacity to reinforce the "materialising" feel
      planetWireMat.opacity = 0.35 + Math.sin(currentTime * 2.5) * 0.20;

      ring1.rotation.y += 0.02;
      ring1.rotation.z += 0.005;
      ring2.rotation.x += 0.03;
      ring2.rotation.y -= 0.01;
      ring3.rotation.z -= 0.015;
      ring3.rotation.x += 0.01;

      const beamPositions = beamParticleSystem.geometry.attributes.position.array;
      for (let i = 0; i < beamPositions.length; i += 3) {
        const index = i / 3;
        beamPositions[i + 1] += (beamSpeeds[index] * delta);

        const x = beamPositions[i];
        const z = beamPositions[i + 2];
        const rotAngle = 0.04 * (beamSpeeds[index] * delta);
        beamPositions[i]     = x * Math.cos(rotAngle) - z * Math.sin(rotAngle);
        beamPositions[i + 2] = x * Math.sin(rotAngle) + z * Math.cos(rotAngle);

        if (beamPositions[i + 1] > 10) {
          beamPositions[i + 1] = -10;
          const r = Math.random() * 0.7;
          const theta = Math.random() * Math.PI * 2;
          beamPositions[i]     = Math.cos(theta) * r;
          beamPositions[i + 2] = Math.sin(theta) * r;
        }
      }
      beamParticleSystem.geometry.attributes.position.needsUpdate = true;
      beamParticleSystem.rotation.y += 0.01;
    }

    // Reset wireframe when leaving Scene 4
    if (activeSceneId !== 4) {
      planet.visible = true;
      atmosphere.visible = true;
      planetWire.visible = false;
    }

    // Scene 5: Experience (Tunnel & DR4Y Text)
    if (activeSceneId === 5) {
      tunnelGroup.visible = true;
      camera.position.z = 5;

      const positions = particleSystem.geometry.attributes.position.array;
      for (let i = 2; i < positions.length; i += 3) {
        positions[i] += 0.8;
        if (positions[i] > 10) positions[i] = -30;
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
      particleSystem.rotation.z += 0.005;

      // 3D logo flies into the tunnel distance (scene5Time 0 → 4s)
      if (logoModel) {
        const scene5Time  = currentTime - 20;
        const logoDuration = 4.0;
        if (scene5Time <= logoDuration) {
          const p     = Math.min(scene5Time / logoDuration, 1);
          const eased = p * p; // ease-in: accelerates into distance
          logoModel.visible = true;
          // logoModel.position.x = 0.5;  
          logoModel.position.z = 4.5 - eased * 24;          // -2 → -26
          logoModel.position.y = -0.125 + Math.sin(scene5Time * -0.4) * 0.4;
          // logoModel.position.y = -0.5 + Math.sin(scene5Time * -0.8) * 0.2;
          logoModel.scale.setScalar(logoBaseScale * Math.max(1 - eased * 0.94, 0.04));
          const opacity = p < 0.6 ? 1 : Math.max(1 - (p - 0.6) / 0.4, 0);
          logoModel.traverse(child => {
            if (child.isMesh) child.material.opacity = opacity;
          });
          // Key light in front, fill light from behind
          logoLight.visible      = true;
          logoFillLight.visible  = true;
          logoLight.intensity    = opacity * 2.25;
          logoFillLight.intensity = opacity * 3.5;
          logoLight.position.set(logoModel.position.x,     logoModel.position.y + 2.5, logoModel.position.z + 6);
          logoFillLight.position.set(logoModel.position.x, logoModel.position.y - 1, logoModel.position.z - -1);
        } else {
          logoModel.visible      = false;
          logoLight.visible      = false;
          logoFillLight.visible  = false;
        }
      }

      if (currentTime > 25) {
        const progress = Math.min((currentTime - 25) / 3, 1);
        dr4yText.material.opacity = progress;
        dr4yText.position.z = -10 + (progress * 5);
        particleSystem.material.opacity = 0.8 * (1 - progress);
      } else {
        dr4yText.material.opacity = 0;
        dr4yText.position.z = -20;
        particleSystem.material.opacity = 0.8;
      }
    }
  }

  renderer.render(scene, camera);
}

// Shared Controls Trigger Setup
function handlePlayToggle() {
  if (isPlaying) {
    isPlaying = false;
    updatePlayButtons(uiStrings.resume[currentLang]);
  } else {
    if (currentTime >= 30 || (playUntil < 30 && currentTime >= playUntil)) {
      // Restart from the very beginning
      currentTime = 0;
      playUntil = 30;
    }
    isPlaying = true;
    updatePlayButtons(uiStrings.pause[currentLang]);
    clock.start();
  }
}

overlayPlayBtn.addEventListener('click', handlePlayToggle);
overlayNextBtn.addEventListener('click', playNextScene);

// Touch events for mobile (prevents 300ms tap delay)
overlayPlayBtn.addEventListener('touchend', (e) => { e.preventDefault(); handlePlayToggle(); });
overlayNextBtn.addEventListener('touchend', (e) => { e.preventDefault(); playNextScene(); });

// Language switcher
// Language toggle (cycles through supported languages)
  const langToggleEl = document.getElementById('langToggleBtn');
  if (langToggleEl) {
    langToggleEl.addEventListener('click', () => {
      const idx = (supportedLangs.indexOf(currentLang) + 1) % supportedLangs.length;
      currentLang = supportedLangs[idx];
      langToggleEl.textContent = langMeta[currentLang] || currentLang.toUpperCase();
      document.documentElement.lang = currentLang;
      const st = document.getElementById('sectionTitle');
      if (st) st.textContent = uiStrings.sectionTitle[currentLang];
      // Refresh play buttons to current state in new language
      overlayNextBtn.innerText = uiStrings.playNext[currentLang];
      if (isPlaying) {
        updatePlayButtons(uiStrings.pause[currentLang]);
      } else if (currentTime >= 30) {
        updatePlayButtons(uiStrings.replay[currentLang]);
      } else if (currentTime > 0 && currentTime >= playUntil) {
        updatePlayButtons(uiStrings.restart[currentLang]);
      } else if (currentTime > 0) {
        updatePlayButtons(uiStrings.resume[currentLang]);
      } else {
        updatePlayButtons(uiStrings.play[currentLang]);
      }
      buildCards();
      updateUI(currentTime);
    });
  }

// Initialize first frame
  const sectionTitleEl = document.getElementById('sectionTitle');
  if (sectionTitleEl) sectionTitleEl.textContent = uiStrings.sectionTitle[currentLang];
  overlayNextBtn.innerText = uiStrings.playNext[currentLang];
  updatePlayButtons(uiStrings.play[currentLang]);
  handleResize();
  updateUI(0);
  planetGroup.visible = true;
  // Hide loading overlay with fade
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    loadingOverlay.addEventListener('transitionend', () => loadingOverlay.remove(), { once: true });
  }
  animate();
}
init();