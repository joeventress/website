const canvas = document.getElementById('simCanvas');
const scene = new THREE.Scene();

function isSmallScreen() {
  return window.innerWidth < 768; // You can adjust the breakpoint if needed
}

// Camera setup
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(-200 * aspect, 200 * aspect, 200, -200, 0.5, 1000);
camera.position.set(100, 10, 100);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

// Simple OrbitControls replacement
class SimpleControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3(0, 0, 0);
    this.enableRotate = true;
    this.enablePan = true;
    this.enableZoom = true;
    this.minZoom = 3;
    this.maxZoom = 20;

    this.isMouseDown = false;
    this.isPanning = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.001;

    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('wheel', this.onWheel.bind(this));
    this.domElement.addEventListener('contextmenu', this.onContextMenu.bind(this)); // suppress right-click menu
  }

  onMouseDown(event) {
    this.isMouseDown = true;
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;

    // Right-click for panning
    this.isPanning = event.button === 2;
  }

  onMouseMove(event) {
    if (!this.isMouseDown) return;

    const deltaX = event.clientX - this.mouseX;
    const deltaY = event.clientY - this.mouseY;

    if (this.isPanning && this.enablePan) {
      const panSpeed = 5;
      const panOffset = new THREE.Vector3();

      // Calculate camera right and up vectors
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      this.camera.getWorldDirection(right);
      right.cross(up).normalize(); // camera's right vector

      const actualUp = new THREE.Vector3();
      actualUp.crossVectors(right, this.camera.getWorldDirection(new THREE.Vector3())).normalize();

      right.multiplyScalar(-deltaX * panSpeed * 0.01);
      actualUp.multiplyScalar(deltaY * panSpeed * 0.01);

      panOffset.add(right).add(actualUp);

      this.camera.position.add(panOffset);
      this.target.add(panOffset);
      this.camera.lookAt(this.target);
    } else if (!this.isPanning && this.enableRotate) {
      // Rotation logic
      const spherical = new THREE.Spherical();
      const offset = new THREE.Vector3();
      offset.copy(this.camera.position).sub(this.target);
      spherical.setFromVector3(offset);

      spherical.theta -= deltaX * this.rotateSpeed;
      spherical.phi += deltaY * this.rotateSpeed;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

      offset.setFromSpherical(spherical);
      this.camera.position.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
    }

    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  }

  onMouseUp() {
    this.isMouseDown = false;
    this.isPanning = false;
  }

  onContextMenu(event) {
    event.preventDefault(); // Prevent default right-click context menu
  }

  onWheel(event) {
    if (!this.enableZoom) return;

    const scale = event.deltaY > 0 ? 1.1 : 0.9;
    const newLeft = this.camera.left * scale;
    const newRight = this.camera.right * scale;
    const newTop = this.camera.top * scale;
    const newBottom = this.camera.bottom * scale;

    const currentZoom = 200 / Math.abs(newRight - newLeft) * 2;
    if (currentZoom >= this.minZoom && currentZoom <= this.maxZoom) {
      this.camera.left = newLeft;
      this.camera.right = newRight;
      this.camera.top = newTop;
      this.camera.bottom = newBottom;
      this.camera.updateProjectionMatrix();
    }
  }

  update() {
    // Called each frame if needed
  }
}


const controls = new SimpleControls(camera, renderer.domElement);

// Data storage
const roadTiles = [];
const buildingObstacles = [];

// Simulation parameters
let pedestrianCount = 500;
let simulationSpeed = 1.0;
let positions, directions, pedestrianGeometry, pedestrianMaterial, points;

// Road tile creation
function createRoadTile(x, z, width, depth, color = 0x333333) {
  const roadGeometry = new THREE.BoxGeometry(width, 0.1, depth);
  const roadMaterial = new THREE.MeshBasicMaterial({ color });
  const tile = new THREE.Mesh(roadGeometry, roadMaterial);
  tile.position.set(x, 0, z);
  scene.add(tile);
  roadTiles.push({ x, z, w: width, d: depth });
}

// Ground plane (black square under the whole city)
const groundSize = 1000;
const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

// Building creation
function createBuilding(x, z, width, depth, height = 1, color = 0x555555) {
  const cellsX = Math.max(1, Math.floor(width));
  const cellsY = Math.max(1, Math.floor(height));
  const pxPerCell = 8;
  const texW = cellsX * pxPerCell;
  const texH = cellsY * pxPerCell;

  const diffCan = document.createElement('canvas');
  diffCan.width = texW;
  diffCan.height = texH;
  const dctx = diffCan.getContext('2d');
  dctx.fillStyle = '#444';
  dctx.fillRect(0, 0, texW, texH);
  dctx.strokeStyle = '#666';
  dctx.lineWidth = 1;

  for (let row = 0; row < cellsY; row++) {
    for (let col = 0; col < cellsX; col++) {
      const px = col * pxPerCell;
      const py = row * pxPerCell;
      dctx.fillStyle = '#222';
      dctx.fillRect(px + 1, py + 1, pxPerCell - 2, pxPerCell - 2);
      dctx.strokeRect(px + 1, py + 1, pxPerCell - 2, pxPerCell - 2);
    }
  }

  const emisCan = document.createElement('canvas');
  emisCan.width = texW;
  emisCan.height = texH;
  const ectx = emisCan.getContext('2d');

  for (let row = 0; row < cellsY; row++) {
    for (let col = 0; col < cellsX; col++) {
      const px = col * pxPerCell;
      const py = row * pxPerCell;
      const isOn = Math.random() < 0.3;
      ectx.fillStyle = isOn ? '#ffffff' : '#000000';
      ectx.fillRect(px + 1, py + 1, pxPerCell - 2, pxPerCell - 2);
    }
  }

  const diffuseTex = new THREE.CanvasTexture(diffCan);
  const emissiveTex = new THREE.CanvasTexture(emisCan);
  diffuseTex.wrapS = diffuseTex.wrapT = THREE.ClampToEdgeWrapping;
  emissiveTex.wrapS = emissiveTex.wrapT = THREE.ClampToEdgeWrapping;
  diffuseTex.magFilter = emissiveTex.magFilter = THREE.NearestFilter;

  const wallMaterial = new THREE.MeshPhongMaterial({
    map: diffuseTex,
    emissiveMap: emissiveTex,
    emissive: new THREE.Color(0xffffcc),
    emissiveIntensity: 1.0,
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const roofMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true
  });

  const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
  const materials = [
    wallMaterial, wallMaterial,
    roofMaterial, roofMaterial,
    wallMaterial, wallMaterial
  ];

  const buildingMesh = new THREE.Mesh(buildingGeometry, materials);
  buildingMesh.position.set(x, height / 2 + 0.01, z);
  scene.add(buildingMesh);
  buildingObstacles.push(buildingMesh);
}

// City layout
function createCityLayout() {
  const numBuildings = 10;
  const buildingSize = 6;
  const roadWidth = 3;
  const minHeight = 5;
  const maxHeight = 30;
  const buildingCoords = [];

  for (let i = 0; i < numBuildings; i++) {
    const x = Math.floor((Math.random() - 0.5) * 8) * 10;
    const z = Math.floor((Math.random() - 0.5) * 8) * 10;
    buildingCoords.push({ x, z });
    const height = Math.random() * (maxHeight - minHeight) + minHeight;
    createBuilding(x, z, buildingSize, buildingSize, height);
  }

  for (let i = 0; i < buildingCoords.length - 1; i++) {
    const a = buildingCoords[i];
    const b = buildingCoords[i + 1];

    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const midZ = a.z;
    for (let x = minX + buildingSize / 2; x < maxX - buildingSize / 2; x += roadWidth) {
      createRoadTile(x, midZ, roadWidth, roadWidth);
    }

    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    const midX = b.x;
    for (let z = minZ + buildingSize / 2; z < maxZ - buildingSize / 2; z += roadWidth) {
      createRoadTile(midX, z, roadWidth, roadWidth);
    } 
  }
  
  // Compute center and bounding size of city
  let sumX = 0, sumZ = 0;
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const coord of buildingCoords) {
    sumX += coord.x;
    sumZ += coord.z;
    if (coord.x < minX) minX = coord.x;
    if (coord.x > maxX) maxX = coord.x;
    if (coord.z < minZ) minZ = coord.z;
    if (coord.z > maxZ) maxZ = coord.z;
  }

  const centerX = sumX / buildingCoords.length;
  const centerZ = sumZ / buildingCoords.length;
  const padding = 20;

  const width = (maxX - minX) + padding;
  const height = (maxZ - minZ) + padding;
  const aspect = window.innerWidth / window.innerHeight;

  const orthoWidth = Math.max(width, height * aspect) / 2;
  const orthoHeight = orthoWidth / aspect;

  camera.left = -orthoWidth;
  camera.right = orthoWidth;
  camera.top = orthoHeight;
  camera.bottom = -orthoHeight;
  camera.updateProjectionMatrix();

  camera.position.set(centerX + 120, 100, centerZ + 120);
  camera.lookAt(centerX, 0, centerZ);
  controls.target.set(centerX, 0, centerZ);
}

// Initialize pedestrians
function initializePedestrians() {
  // Remove existing pedestrians
  if (points) {
    scene.remove(points);
  }
  
  positions = new Float32Array(pedestrianCount * 3);
  directions = new Array(pedestrianCount);
  let pIndex = 0;

  while (pIndex < pedestrianCount * 3) {
    const tile = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const x = tile.x + (Math.random() - 0.5) * tile.w;
    const z = tile.z + (Math.random() - 0.5) * tile.d;
    positions[pIndex] = x;
    positions[pIndex + 1] = 0.1;
    positions[pIndex + 2] = z;
    pIndex += 3;
  }

  for (let i = 0; i < pedestrianCount; i++) {
    const dirs = [
      { x: 0.05, z: 0 },
      { x: -0.05, z: 0 },
      { x: 0, z: 0.05 },
      { x: 0, z: -0.05 }
    ];
    directions[i] = dirs[Math.floor(Math.random() * dirs.length)];
  }

  pedestrianGeometry = new THREE.BufferGeometry();
  pedestrianGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pedestrianMaterial = new THREE.PointsMaterial({
    size: 2.5,
    color: 0xffffff,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: false
  });
  points = new THREE.Points(pedestrianGeometry, pedestrianMaterial);
  scene.add(points);
}

// Road check
function isOnRoad(x, z) {
  return roadTiles.some(tile =>
    Math.abs(x - tile.x) < tile.w / 2 &&
    Math.abs(z - tile.z) < tile.d / 2
  );
}

// Enhanced movement with crowd avoidance
function getLocalCrowdDensity(x, z, positions, currentIndex) {
  let nearbyCount = 0;
  const checkRadius = 3;
  
  for (let i = 0; i < positions.length; i += 3) {
    if (i === currentIndex) continue;
    
    const dx = positions[i] - x;
    const dz = positions[i + 2] - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < checkRadius) {
      nearbyCount++;
    }
  }
  
  return nearbyCount;
}

// Performance monitoring
let frameCount = 0;
let lastTime = Date.now();
let fps = 0;

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Calculate FPS
  frameCount++;
  const currentTime = Date.now();
  if (currentTime - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
    
    // Update UI
    updateUI();
  }
  
  if (!points) return;
  
  const pos = pedestrianGeometry.attributes.position.array;

  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i];
    let z = pos[i + 2];
    let moved = false;

    const dir = directions[i / 3];
    
    // Check crowd density and adjust speed
    const crowdDensity = getLocalCrowdDensity(x, z, pos, i);
    let speedMultiplier = Math.max(0.2, 1 - crowdDensity * 0.1);
    speedMultiplier *= simulationSpeed;
    
    const newX = x + dir.x * speedMultiplier + (Math.random() - 0.5) * 0.02;
    const newZ = z + dir.z * speedMultiplier + (Math.random() - 0.5) * 0.02;

    if (isOnRoad(newX, newZ)) {
      x = newX;
      z = newZ;
      moved = true;
    } else {
      const altDirs = [
        { x: -dir.z, z: dir.x },
        { x: dir.z, z: -dir.x }
      ].sort(() => Math.random() - 0.5);

      for (const d of altDirs) {
        const tx = x + d.x * speedMultiplier;
        const tz = z + d.z * speedMultiplier;
        if (isOnRoad(tx, tz)) {
          directions[i / 3] = d;
          x = tx;
          z = tz;
          moved = true;
          break;
        }
      }

      if (!moved) {
        directions[i / 3] = { x: -dir.x, z: -dir.z };
      }
    }

    pos[i] = x;
    pos[i + 2] = z;
  }

  pedestrianGeometry.attributes.position.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// UI Functions
function updateUI() {
  const stats = document.getElementById('stats');
  if (stats) {
    stats.innerHTML = `
      <div>Active Pedestrians: ${pedestrianCount}</div>
      <div>Simulation Speed: ${simulationSpeed.toFixed(1)}x</div>
      <div>FPS: ${fps}</div>
      <div>Road Tiles: ${roadTiles.length}</div>
    `;
  }
}

function createControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'control-panel';
  panel.style.cssText = `
    position: absolute;
    top: 50vh;
    left: auto; /* Add this */
    right: 55vw;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 1vw 2vw;
    border-radius: 2vw;
    border: 0.2vw solid #333;
    z-index: 100;
    font-family: Arial, sans-serif;
    font-size: 0.7em;
    max-width: 90vw;
    min-width: 180px;
    box-sizing: border-box;
    box-shadow: 0 0.5vw 2vw rgba(0,0,0,0.4);
    resize: both;
    overflow: auto;
    cursor: move;
  `;

  if (isSmallScreen) {
    panel.style.top = '740px';       // Fixed pixel offset to avoid text
    panel.style.left = '5vw';
    panel.style.right = 'auto';
    panel.style.width = '650px';
    panel.style.height = '200px';
  } else {
    panel.style.bottom = '50px';     // Use bottom instead of top on desktop
    panel.style.right = '50px';
    panel.style.top = '50px';
    panel.style.left = 'auto';
    panel.style.height = '400px';
  }

  panel.style.resize = 'both';
  panel.style.overflow = 'auto';
  panel.style.cursor = 'move';


  // DRAG START
  function startDrag(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Optional: only drag if clicked on panel header (e.g., h3)
    if (e.target.closest('h3') || e.target === panel) {
      isDragging = true;
      offsetX = clientX - panel.offsetLeft;
      offsetY = clientY - panel.offsetTop;
      document.body.style.userSelect = 'none';
    }
  }

  // DRAG MOVE
  function onDrag(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    panel.style.left = `${clientX - offsetX}px`;
    panel.style.top = `${clientY - offsetY}px`;
    panel.style.right = 'auto'; // override 'right' if present
  }

  // DRAG END
  function endDrag() {
    isDragging = false;
    document.body.style.userSelect = '';
  }

  // Event listeners
  panel.addEventListener('mousedown', startDrag);
  panel.addEventListener('touchstart', startDrag, { passive: false });

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });

  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  
  panel.innerHTML = `
    <h3 style="margin-top: 0; color:rgb(249, 249, 249); font-size: 1.1em;">Crowd Simulation Control (Illustrative)</h3>
    
    <div style="margin-bottom: 2vh;">
      <label style="display: block; margin-bottom: 1vh;">
        Population: <span id="populationValue" style="color:rgb(255, 255, 255); font-weight: bold;">${pedestrianCount}</span>
      </label>
      <input type="range" id="populationSlider" min="50" max="5000" value="${pedestrianCount}" step="50" 
             style="width: 100%; margin-bottom: 2vh;">
    </div>
    
    <div style="margin-bottom: 2vh;">
      <label style="display: block; margin-bottom: 1vh;">
        Speed: <span id="speedValue" style="color:rgb(255, 255, 255); font-weight: bold;">${simulationSpeed.toFixed(1)}x</span>
      </label>
      <input type="range" id="speedSlider" min="0.1" max="3.0" value="${simulationSpeed}" step="0.1" 
             style="width: 100%; margin-bottom: 2vh;">
    </div>
    
    <div style="margin-bottom: 2vh;">
      <button id="resetButton" style="background: #333; color: white; border: 0.2vw solid #555; padding: 1vw 2vw; border-radius: 1vw; cursor: pointer; margin-right: 1vw;">
        Reset Simulation
      </button>
      <button id="newCityButton" style="background: #333; color: white; border: 0.2vw solid #555; padding: 1vw 2vw; border-radius: 1vw; cursor: pointer;">
        New City
      </button>
    </div>
    
    <div id="stats" style="margin-top: 2vh; padding-top: 2vh; border-top: 0.2vw solid #333; font-size: 1em;">
      <div>Active Pedestrians: ${pedestrianCount}</div>
      <div>Simulation Speed: ${simulationSpeed.toFixed(1)}x</div>
      <div>FPS: 60</div>
      <div>Road Tiles: ${roadTiles.length}</div>
    </div>
    
    <div style="margin-top: 2vh; padding-top: 2vh; border-top:  solid #333; font-size: 0.95em; color: #888;">
      <strong>Urban Design Simulation</strong><br>
      Demonstrates pedestrian flow patterns for urban planning and crowd management analysis. Drag & Resize
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Same event listeners as before...
  document.getElementById('populationSlider').addEventListener('input', (e) => {
    pedestrianCount = parseInt(e.target.value);
    document.getElementById('populationValue').textContent = pedestrianCount;
    initializePedestrians();
  });
  
  document.getElementById('speedSlider').addEventListener('input', (e) => {
    simulationSpeed = parseFloat(e.target.value);
    document.getElementById('speedValue').textContent = simulationSpeed.toFixed(1) + 'x';
  });
  
  document.getElementById('resetButton').addEventListener('click', () => {
    initializePedestrians();
  });
  
  document.getElementById('newCityButton').addEventListener('click', () => {
    roadTiles.length = 0;
    buildingObstacles.length = 0;
    const objectsToRemove = [];
    scene.traverse((child) => {
      if (child.isMesh && child !== ground) {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach(obj => scene.remove(obj));
    createCityLayout();
    initializePedestrians();
  });

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  panel.addEventListener('mousedown', function (e) {
    if (e.target !== panel) return; // Only allow dragging from the panel, not inner elements
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = 'none'; // Prevent text selection
  });

  document.addEventListener('mousemove', function (e) {
    if (isDragging) {
      panel.style.left = `${e.clientX - offsetX}px`;
      panel.style.top = `${e.clientY - offsetY}px`;
    }
  });

  document.addEventListener('mouseup', function () {
    isDragging = false;
    document.body.style.userSelect = ''; // Re-enable text selection
  });
}  

// Window resize handler
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -200 * aspect;
  camera.right = 200 * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize everything
createCityLayout();
initializePedestrians();
createControlPanel();
animate();