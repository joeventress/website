const canvas = document.getElementById('simCanvas');
const scene = new THREE.Scene();

// Camera setup
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(-200 * aspect, 200 * aspect, 200, -200, 0.5, 1000);
camera.position.set(100, 10, 100);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.minZoom = 0.5;
controls.maxZoom = 5;



// Data storage
const roadTiles = [];
const buildingObstacles = [];

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
const groundSize = 1000; // Adjust size as needed
const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to lie flat
ground.position.y = -0.01;        // Just below 0 to avoid z-fighting
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

    camera.position.set(centerX + 120, 100, centerZ + 120); // directly above at an angle
    camera.lookAt(centerX, 0, centerZ);
    controls.target.set(centerX, 0, centerZ);
  } 


createCityLayout();

// Pedestrians
const count = 500;
const positions = new Float32Array(count * 3);
let pIndex = 0;

while (pIndex < count * 3) {
  const tile = roadTiles[Math.floor(Math.random() * roadTiles.length)];
  const x = tile.x + (Math.random() - 0.5) * tile.w;
  const z = tile.z + (Math.random() - 0.5) * tile.d;
  positions[pIndex] = x;
  positions[pIndex + 1] = 0.1;
  positions[pIndex + 2] = z;
  pIndex += 3;
}

const directions = new Array(count).fill().map(() => {
  const dirs = [
    { x: 0.05, z: 0 },
    { x: -0.05, z: 0 },
    { x: 0, z: 0.05 },
    { x: 0, z: -0.05 }
  ];
  return dirs[Math.floor(Math.random() * dirs.length)];
});

const pedestrianGeometry = new THREE.BufferGeometry();
pedestrianGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const pedestrianMaterial = new THREE.PointsMaterial({
  size: 2.5,
  color: 0xffffff,
  depthTest: true,
  depthWrite: false,
  sizeAttenuation: false
});
const points = new THREE.Points(pedestrianGeometry, pedestrianMaterial);
scene.add(points);

// Road check
function isOnRoad(x, z) {
  return roadTiles.some(tile =>
    Math.abs(x - tile.x) < tile.w / 2 &&
    Math.abs(z - tile.z) < tile.d / 2
  );
}

// Animation
function animate() {
  requestAnimationFrame(animate);
  const pos = pedestrianGeometry.attributes.position.array;

  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i];
    let z = pos[i + 2];
    let moved = false;

    const dir = directions[i / 3];
    const newX = x + dir.x + (Math.random() - 0.5) * 0.02;
    const newZ = z + dir.z + (Math.random() - 0.5) * 0.02;

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
        const tx = x + d.x;
        const tz = z + d.z;
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

animate();

