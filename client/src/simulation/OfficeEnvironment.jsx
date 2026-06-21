import FurniturePiece from "./FurniturePiece";

export default function OfficeEnvironment() {
  return (
    <group>
      {/* Perimeter bookcases */}
      <FurniturePiece
        type="bookshelf"
        position={[-8, 0, -6]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <FurniturePiece
        type="bookshelf"
        position={[8, 0, -6]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <FurniturePiece
        type="bookshelf"
        position={[-8, 0, 6]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Couch + round table */}
      <FurniturePiece
        type="couch"
        position={[0, 0, 10]}
        rotation={[0, -Math.PI*1.2, 0]}
      />
      <FurniturePiece type="roundTable" position={[-1, .9, 10]} />
      <FurniturePiece type="plant" position={[11.5, 0, 1.2]} />
      <FurniturePiece type="lamp" position={[8.5, 0, 5.5]} />

      {/* Walls*/}
      <mesh position={[0, 3, -11]} castShadow receiveShadow>
        <boxGeometry args={[28, 6, 0.2]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-14, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 6, 22]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[14, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 6, 22]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
