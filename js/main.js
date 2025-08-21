import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Raycaster } from 'three';
import { Vector2 } from 'three';
import { Plane } from 'three';
import { Vector3 } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js'; 

// =====================
// 1. 초기 설정
// =====================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('signboard-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

camera.position.set(0, 5, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.update();

// 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

// 바닥면 (그림자 확인용)
const planeGeometry = new THREE.PlaneGeometry(50, 10);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
planeMesh.rotation.x = -Math.PI / 2;
planeMesh.receiveShadow = true;
scene.add(planeMesh);

// 축 헬퍼 (X: 빨강, Y: 초록, Z: 파랑) 추가
const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// =====================
// 2. 모델 및 폰트 로드
// =====================
const gltfLoader = new GLTFLoader();
const fontLoader = new FontLoader();

let signboardPlateMesh; 
let loadedFont;
let logoMesh = null; 
let textMeshes = [];

// 폰트 파일 로드
fontLoader.load(
    '../assets/fonts/noto_sans_kr_regular.json',
    (font) => {
        loadedFont = font;
        console.log('Font loaded!');
        updateSignboard();
    },
    (xhr) => { console.log('Font loading progress:', (xhr.loaded / xhr.total * 100) + '%'); },
    (error) => { console.error('An error happened loading the font', error); }
);

// 로고 GLB 모델 로드
gltfLoader.load(
    '../assets/signboard.glb',
    (gltf) => {
        logoMesh = gltf.scene;
        // 로고 위치는 updateSignboard에서 설정
        const logoScale = 1; 
        logoMesh.scale.set(logoScale, logoScale, logoScale);
        
        logoMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(logoMesh);
        updateSignboard();
    },
    (xhr) => { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
    (error) => { console.error('An error happened loading the GLB model', error); }
);

// =====================
// 3. UI 이벤트 및 업데이트 함수
// =====================
const uiPanel = document.getElementById('ui-panel');
const textInputsContainer = document.getElementById('text-inputs');
const addLineButton = document.getElementById('add-text-line');
const exportStlButton = document.getElementById('export-stl'); 

uiPanel.addEventListener('input', (event) => {
    // 헥사 코드 텍스트 필드 업데이트
    if (event.target.type === 'color') {
        const hexInput = document.getElementById(event.target.id + '-hex');
        if (hexInput) {
            hexInput.value = event.target.value;
        }
    } else if (event.target.classList.contains('color-hex-input')) {
        const colorInput = document.getElementById(event.target.id.replace('-hex', ''));
        if (colorInput) {
            colorInput.value = event.target.value;
        }
    }

    updateSignboard();
});

addLineButton.addEventListener('click', () => {
    const lineCount = document.querySelectorAll('.text-line-setting').length;
    const newLineId = lineCount + 1;
    
    const newDiv = document.createElement('div');
    newDiv.classList.add('text-line-setting');
    newDiv.innerHTML = `
        <div class="input-group">
            <label for="text-line-${newLineId}">줄 ${newLineId}:</label>
            <input type="text" id="text-line-${newLineId}" value="" class="text-input" placeholder="문구를 입력하세요">
        </div>
        <div class="input-group">
            <label for="font-line-${newLineId}">폰트:</label>
            <select id="font-line-${newLineId}" class="font-select">
                <option value="noto_sans_kr_regular">노토산스</option>
            </select>
        </div>
        <div class="input-group">
            <label for="color-line-${newLineId}">색상:</label>
            <div class="color-picker-container">
                <input type="color" id="color-line-${newLineId}" value="#000000">
                <input type="text" id="color-line-${newLineId}-hex" class="color-hex-input" value="#000000">
            </div>
        </div>
        <div class="input-group">
            <label for="size-line-${newLineId}">크기:</label>
            <input type="number" id="size-line-${newLineId}" value="1" step="0.1" min="0.1">
        </div>
    `;
    textInputsContainer.appendChild(newDiv);

    // 새 줄이 추가될 때 헥사코드 입력 필드에 이벤트 리스너 추가
    const newColorInput = document.getElementById(`color-line-${newLineId}`);
    newColorInput.addEventListener('input', (event) => {
        document.getElementById(`color-line-${newLineId}-hex`).value = event.target.value;
        updateSignboard();
    });
    const newHexInput = document.getElementById(`color-line-${newLineId}-hex`);
    newHexInput.addEventListener('input', (event) => {
        newColorInput.value = event.target.value;
        updateSignboard();
    });
});

exportStlButton.addEventListener('click', exportToSTL); 

function updateSignboard() {
    if (!loadedFont) {
        return;
    }

    textMeshes.forEach(mesh => scene.remove(mesh));
    textMeshes = [];

    // 간판 '판' 생성 또는 크기 업데이트
    const signWidth = parseFloat(document.getElementById('sign-width').value);
    const signHeight = parseFloat(document.getElementById('sign-height').value);
    const signColor = document.getElementById('sign-color').value;

    if (!signboardPlateMesh) {
        const plateGeometry = new THREE.BoxGeometry(signWidth, signHeight, 0.2);
        const plateMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(signColor), 
            metalness: 0.2, 
            roughness: 0.8 
        });
        signboardPlateMesh = new THREE.Mesh(plateGeometry, plateMaterial);
        
        signboardPlateMesh.position.set(0, signHeight / 2, -0.5); 
        signboardPlateMesh.receiveShadow = true; 
        scene.add(signboardPlateMesh);
    } else {
        signboardPlateMesh.geometry = new THREE.BoxGeometry(signWidth, signHeight, 0.2);
        signboardPlateMesh.position.y = signHeight / 2; 
        signboardPlateMesh.material.color.set(signColor);
    }
    
    // 로고 위치 업데이트 (간판 너비에 따라 동적으로)
    if (logoMesh) {
        logoMesh.position.x = -signWidth / 2.5; // 간판 너비의 1/4 지점으로 설정
        logoMesh.position.y = signHeight / 4;
    }

    const textInputs = document.querySelectorAll('.text-input');
    const totalLines = textInputs.length;
    
    let totalTextHeight = 0;
    const textSizes = [];
    textInputs.forEach(input => {
        const size = parseFloat(document.getElementById(`size-line-${input.id.slice(-1)}`).value);
        textSizes.push(size);
        totalTextHeight += size;
    });

    totalTextHeight += (totalLines - 1) * 0.5;

    let currentY = totalTextHeight / 2 - textSizes[0] / 2;

    textInputs.forEach((input, index) => {
        const textValue = input.value;
        const lineNum = index + 1;

        if (textValue.trim() === '') {
            return;
        }

        const color = document.getElementById(`color-line-${lineNum}`).value;
        const size = parseFloat(document.getElementById(`size-line-${lineNum}`).value);

        const textGeo = new TextGeometry(textValue, {
            font: loadedFont,
            size: size,
            height: 0.2,
        });
        textGeo.computeBoundingBox();

        const textMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            metalness: 0.5,
            roughness: 0.5
        });
        const textMesh = new THREE.Mesh(textGeo, textMat);

        const textWidth = textGeo.boundingBox.max.x - textGeo.boundingBox.min.x;
        textMesh.position.x = -textWidth / 2;
        textMesh.position.y = currentY + signboardPlateMesh.position.y;
        textMesh.position.z = -0.4; 

        textMesh.castShadow = true;
        
        scene.add(textMesh);
        textMeshes.push(textMesh);
        
        currentY -= (size / 2 + (index < totalLines - 1 ? textSizes[index + 1] / 2 : 0) + 0.5);
    });
}

function exportToSTL() {
    if (!signboardPlateMesh || !logoMesh || textMeshes.length === 0) {
        alert("내보낼 3D 모델이 없습니다. 간판을 먼저 만들어주세요.");
        return;
    }

    const exporter = new STLExporter();
    
    const exportGroup = new THREE.Group();
    
    exportGroup.add(signboardPlateMesh.clone());

    const clonedLogo = logoMesh.clone();
    clonedLogo.position.copy(logoMesh.position);
    clonedLogo.scale.copy(logoMesh.scale);
    exportGroup.add(clonedLogo);
    
    textMeshes.forEach(mesh => {
        const clonedMesh = mesh.clone();
        clonedMesh.position.copy(mesh.position);
        exportGroup.add(clonedMesh);
    });
    
    const result = exporter.parse(exportGroup, { binary: true });
    
    const blob = new Blob([result], { type: 'application/octet-stream' });
    
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.href = URL.createObjectURL(blob);
    link.download = 'signboard_design.stl';
    link.click();
    
    document.body.removeChild(link);
}

// =====================
// 4. 애니메이션 루프
// =====================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// 윈도우 크기 변경 시 렌더러와 카메라 업데이트
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// =====================
// 5. 마우스 드래그 로직 (로고 및 문구 이동 기능)
// =====================
const raycaster = new Raycaster();
const mouse = new Vector2();
let isDragging = false;
let draggableObject = null;
const intersectPlane = new Plane(new Vector3(0, 0, 1), 0);
const offset = new Vector3();

const canvas = document.getElementById('signboard-canvas');

canvas.addEventListener('mousedown', onMouseDown, false);
canvas.addEventListener('mousemove', onMouseMove, false);
canvas.addEventListener('mouseup', onMouseUp, false);

function onMouseDown(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const interactiveObjects = [];
    if (logoMesh) {
        interactiveObjects.push(logoMesh);
    }
    interactiveObjects.push(...textMeshes);

    const intersects = raycaster.intersectObjects(interactiveObjects, true);
    
    if (intersects.length > 0) {
        const intersected = intersects[0].object;
        
        if (textMeshes.includes(intersected)) {
            draggableObject = intersected;
        } 
        else {
            let currentParent = intersected.parent;
            while(currentParent) {
                if (currentParent === logoMesh) {
                    draggableObject = logoMesh;
                    break;
                }
                currentParent = currentParent.parent;
            }
        }
        
        if (draggableObject) {
            isDragging = true;
            controls.enabled = false;

            intersectPlane.setFromNormalAndCoplanarPoint(
                new Vector3(0, 0, 1),
                draggableObject.position
            );
            
            const intersection = new Vector3();
            if (raycaster.ray.intersectPlane(intersectPlane, intersection)) {
                offset.copy(intersection).sub(draggableObject.position);
            }
        }
    }
}

function onMouseMove(event) {
    if (!isDragging || !draggableObject) return;

    event.preventDefault();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersection = new Vector3();
    if (raycaster.ray.intersectPlane(intersectPlane, intersection)) {
        draggableObject.position.copy(intersection.sub(offset));
    }
}

function onMouseUp(event) {
    isDragging = false;
    draggableObject = null;
    controls.enabled = true;
}