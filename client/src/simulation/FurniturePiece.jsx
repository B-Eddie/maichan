import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

const FURNITURE_GLB = {
  desk: '/office-assets/models/furniture/desk.glb',
  chair: '/office-assets/models/furniture/chairDesk.glb',
  computer: '/office-assets/models/furniture/computerScreen.glb',
  plant: '/office-assets/models/furniture/pottedPlant.glb',
  plantSmall: '/office-assets/models/furniture/plantSmall1.glb',
  bookshelf: '/office-assets/models/furniture/bookcaseClosed.glb',
  lamp: '/office-assets/models/furniture/lampRoundFloor.glb',
  couch: '/office-assets/models/furniture/loungeSofa.glb',
  roundTable: '/office-assets/models/furniture/tableRound.glb',
  coffeeMachine: '/office-assets/models/furniture/kitchenCoffeeMachine.glb',
  fridge: '/office-assets/models/furniture/kitchenFridgeSmall.glb',
  cabinet: '/office-assets/models/furniture/kitchenCabinet.glb',
};

const FURNITURE_SCALE = {
  desk: [1.5, 1.5, 1.5],
  chair: [1.2, 1.2, 1.2],
  computer: [1.1, 1.1, 1.1],
  plant: [1.2, 1.8, 1.2],
  plantSmall: [1, 2, 1],
  bookshelf: [1.5, 2, 1.5],
  lamp: [1.2, 1.2, 1.2],
  couch: [1.8, 1.8, 1.8],
  roundTable: [3.2, 3.2, 3.2],
  coffeeMachine: [0.8, 0.8, 0.8],
  fridge: [1, 1.4, 1],
  cabinet: [2.6, 1.2, 1],
};

const FURNITURE_TINT = {
  desk: '#8b5e32',
  chair: '#4a5568',
  computer: '#363c58',
  plant: null,
  plantSmall: '#3a5070',
  bookshelf: '#5c3520',
  lamp: '#c8a060',
  couch: '#3d5575',
  roundTable: '#9a6332',
  coffeeMachine: '#2d2d38',
  fridge: '#505a60',
  cabinet: '#3c4248',
};

export const FURNITURE_Y_OFFSET = {
  computer: 0.61,
};

// creates a tinted clone of 3D model scene based on the type of furniture
function tintScene(scene, itemType) {
  const tint = FURNITURE_TINT[itemType];
  const tintColor = tint ? new THREE.Color(tint) : null;
  const clone = scene.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = mats.map((material) => {
      const next = material.clone();
      if (tintColor && next.color) next.color.lerp(tintColor, 0.8);
      if ('roughness' in next) next.roughness = 0.65;
      if ('metalness' in next) next.metalness = 0.08;
      return next;
    });
    child.material = Array.isArray(child.material) ? cloned : cloned[0];
  });
  return clone;
}

// throws furniture into scnee
export default function FurniturePiece({ type, position = [0, 0, 0], rotation = [0, 0, 0] }) {
  const glbPath = FURNITURE_GLB[type];
  const { scene } = useGLTF(glbPath);
  const model = useMemo(() => tintScene(scene, type), [scene, type]);
  const scale = FURNITURE_SCALE[type] || [1, 1, 1];
  const yOffset = FURNITURE_Y_OFFSET[type] ?? 0;

  return (
    <group position={[position[0], position[1] + yOffset, position[2]]} rotation={rotation}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

Object.values(FURNITURE_GLB).forEach((path) => useGLTF.preload(path));