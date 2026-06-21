import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import ChatStation from "./ChatStation";
import OfficeEnvironment from "./OfficeEnvironment";
import StationPanel from "./StationPanel";

const PANEL_DISTANCE_FACTOR = 8; // panel resizing based on zoom - distance from camera

// get layout position - when a lot of stations, make it in circle
function stationLayout(index) {
  const x = (index % 3) * 5.5 - 5.5;
  const z = Math.floor(index / 3) * 5 - 2.5;
  const rotY = Math.atan2(-x, -z);
  return { x, z, rotY };
}

function StationBoard() {
  return (
    <>
      <mesh position={[0, 0, -1.3]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 3.3, 0.15]} />
        <meshStandardMaterial color="#fff" roughness={0.8} metalness={0.05} />
      </mesh>
    </>
  );
}

function OfficeScene({
  stations,
  chatPersonalities,
  isSaving,
  onPersonalityChange,
  onSave,
  onPanelInteract,
  controlsEnabled,
  onOpenChat,
  onWalkComplete,
}) {
  return (
    <>
      {/* bg */}
      <color attach="background" args={["#D7D0C3"]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        castShadow
        position={[8, 14, 6]}
        intensity={1.2}
        shadow-mapSize={[2048, 2048]}
      />
      <hemisphereLight args={["#87ceeb", "#334155", 0.35]} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#AD6E7D" />
      </mesh>

      {/* carpet */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
      >
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#72525E" roughness={0.9} />
      </mesh>

      {/* scene */}
      <OfficeEnvironment />

      {stations.length === 0 ? (
        <Html center transform={false} style={{ pointerEvents: "none" }}>
          <div className="sim-empty">Watch a chat to see it appear here</div>
        </Html>
      ) : (
        stations.map((station, index) => {
          const { x, z, rotY } = stationLayout(index);
          return (
            <group key={station.chatId}>
              <ChatStation
                station={station}
                index={index}
                onOpenChat={onOpenChat}
                onWalkComplete={onWalkComplete}
              />
              <group position={[x, 2.55, z]} rotation={[0, rotY, 0]}>
                <StationBoard />
                <Html
                  position={[0, 0, -1.2]}
                  transform
                  distanceFactor={PANEL_DISTANCE_FACTOR}
                  center
                  occlude="blending"
                  zIndexRange={[100, 0]}
                  style={{ pointerEvents: "auto" }}
                >
                  <StationPanel
                    station={station}
                    personalityValue={chatPersonalities[station.chatId] || ""}
                    isSaving={isSaving}
                    onPersonalityChange={onPersonalityChange}
                    onSave={onSave}
                    onPanelInteract={onPanelInteract}
                    onOpenChat={onOpenChat}
                  />
                </Html>
              </group>
            </group>
          );
        })
      )}

      <OrbitControls
        makeDefault
        enabled={controlsEnabled}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={32}
        target={[0, 1, 0]}
        enableDamping={false}
      />
    </>
  );
}

export default function ConversationOffice({
  stations,
  chatPersonalities,
  isSaving,
  onPersonalityChange,
  onSave,
  onOpenChat,
  onWalkComplete,
}) {
  const [controlsEnabled, setControlsEnabled] = useState(true);

  return (
    <div className="sim-canvas-wrap">
      <Canvas shadows camera={{ position: [0, 10, 16], fov: 42 }}>
        <OfficeScene
          stations={stations}
          chatPersonalities={chatPersonalities}
          isSaving={isSaving}
          onPersonalityChange={onPersonalityChange}
          onSave={onSave}
          onPanelInteract={setControlsEnabled}
          controlsEnabled={controlsEnabled}
          onOpenChat={onOpenChat}
          onWalkComplete={onWalkComplete}
        />
      </Canvas>
    </div>
  );
}
