import { RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useEffect } from 'react';
import { createAgentAvatarProfile } from './avatarProfile';

// character styling
function Hair({ style, color }) {
  if (style === 'bald') return null;

  if (style === 'cap') {
    return (
      <mesh position={[0, 0.1, 0.02]} castShadow>
        <sphereGeometry args={[0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    );
  }

  if (style === 'bob') {
    return (
      <group position={[0, -0.02, -0.02]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <sphereGeometry args={[0.21, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      {[-0.08, 0, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.14, 0]} rotation={[0.2, 0, x * 2]} castShadow>
          <coneGeometry args={[0.05, 0.14, 6]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function BotFace({ active }) {
  return (
    <group position={[0, 0, 0.17]}>
      <mesh>
        <planeGeometry args={[0.22, 0.16]} />
        <meshStandardMaterial color="#0c1222" emissive="#1e3a8a" emissiveIntensity={active ? 0.6 : 0.25} />
      </mesh>
      <mesh position={[-0.05, 0.02, 0.01]}>
        <circleGeometry args={[0.025, 12]} />
        <meshBasicMaterial color={active ? '#67e8f9' : '#475569'} />
      </mesh>
      <mesh position={[0.05, 0.02, 0.01]}>
        <circleGeometry args={[0.025, 12]} />
        <meshBasicMaterial color={active ? '#67e8f9' : '#475569'} />
      </mesh>
      <mesh position={[0, -0.04, 0.01]}>
        <planeGeometry args={[0.08, 0.02]} />
        <meshBasicMaterial color={active ? '#67e8f9' : '#334155'} />
      </mesh>
    </group>
  );
}

function HumanFace({ skin }) {
  return (
    <group position={[0, 0, 0.16]}>
      <mesh position={[-0.055, 0.02, 0]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>
      <mesh position={[0.055, 0.02, 0]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>
      <mesh position={[-0.055, 0.02, 0.02]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0.055, 0.02, 0.02]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, -0.05, 0.01]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.03, 0.008, 8, 16, Math.PI]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
    </group>
  );
}

// change text ending to ... if length bigger than max character
function truncateText(text, max = 60) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// display text bubbles
function SpeechBubble({ text, y = 1.35, color = '#1e293b', textColor = '#e2e8f0' }) {
  if (!text) return null;
  const lines = Math.ceil(text.length / 15); // get # of lines by dividing # of characters
  const height = Math.max(lines * 0.2, .44);
  const width = Math.min(0.9 + text.length * 0.004, 1.4);

  return (
    <group position={[0, y, 0.15]}>
      <RoundedBox args={[width, height, 0.04]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color={color} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, -height / 2 - 0.04, 0]}>
        <coneGeometry args={[0.05, 0.1, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <Text
        position={[0, 0, 0.03]}
        fontSize={0.1}
        color={textColor}
        maxWidth={width - 0.12}
        textAlign="center"
        lineHeight={1.2}
      >
        {truncateText(text, 80)}
      </Text>
    </group>
  );
}

export default function AgentCharacter({
  seed,
  name,
  subtitle,
  color,
  position = [0, 0, 0],
  rotationY = 0,
  state = 'standing',
  showBubble = false,
  bubbleText = '',
  walkFrom = null,
  onWalkComplete,
}) {
  const groupRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const headRef = useRef();
  const frameRef = useRef(0);
  const walkProgress = useRef(walkFrom ? 0 : 1);
  const appearance = useMemo(() => createAgentAvatarProfile(seed), [seed]);

  const isBot = appearance.isBot;
  const skin = appearance.body.skinTone;
  const topColor = color || appearance.clothing.topColor;
  const bottomColor = appearance.clothing.bottomColor;
  const shoeColor = appearance.clothing.shoesColor;
  const isWorking = state === 'working';
  const isWalking = walkFrom && walkProgress.current < 1;

  useEffect(() => {
    if (walkFrom) walkProgress.current = 0;
  }, [walkFrom]);

  // show walking
  useFrame((_, delta) => {
    frameRef.current += delta * 60;
    const t = frameRef.current;

    if (walkFrom && walkProgress.current < 1) {
      walkProgress.current = Math.min(1, walkProgress.current + delta * 1.2);
      const ease = 1 - Math.pow(1 - walkProgress.current, 3);
      const x = walkFrom[0] + (position[0] - walkFrom[0]) * ease;
      const z = walkFrom[2] + (position[2] - walkFrom[2]) * ease;
      if (groupRef.current) {
        groupRef.current.position.x = x;
        groupRef.current.position.z = z;
      }
      if (walkProgress.current >= 1 && onWalkComplete) onWalkComplete();
    }

    const bob = isWalking
      ? Math.abs(Math.sin(t * 0.25)) * 0.04
      : isWorking
        ? Math.sin(t * 0.1) * 0.03
        : Math.sin(t * 0.05) * 0.015;

    if (groupRef.current) {
      if (!walkFrom || walkProgress.current >= 1) {
        groupRef.current.position.x = position[0];
        groupRef.current.position.z = position[2];
      }
      groupRef.current.position.y = position[1] + bob;
    }

    const armSwing = isWalking
      ? Math.sin(t * 0.3) * 0.4
      : isWorking
        ? Math.sin(t * 0.15) * 0.25
        : 0.05;
    if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing * 0.6;

    if (headRef.current && (isWorking || isWalking)) {
      headRef.current.rotation.x = Math.sin(t * 0.08) * 0.06;
    }
  });

  const bodyMat = { roughness: 0.65, metalness: isBot ? 0.35 : 0.05 };

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-0.07, 0.2, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.3, 6, 12]} />
        <meshStandardMaterial color={bottomColor} {...bodyMat} />
      </mesh>
      <mesh position={[0.07, 0.2, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.3, 6, 12]} />
        <meshStandardMaterial color={bottomColor} {...bodyMat} />
      </mesh>

      <mesh position={[-0.07, 0.04, 0.03]} castShadow>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={shoeColor} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0.07, 0.04, 0.03]} castShadow>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={shoeColor} roughness={0.5} metalness={0.1} />
      </mesh>

      <RoundedBox args={[0.3, 0.34, 0.18]} radius={0.04} smoothness={4} position={[0, 0.58, 0]} castShadow>
        <meshStandardMaterial color={topColor} {...bodyMat} />
      </RoundedBox>

      <group ref={leftArmRef} position={[-0.2, 0.68, 0]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <capsuleGeometry args={[0.04, 0.22, 6, 10]} />
          <meshStandardMaterial color={topColor} {...bodyMat} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.2, 0.68, 0]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <capsuleGeometry args={[0.04, 0.22, 6, 10]} />
          <meshStandardMaterial color={topColor} {...bodyMat} />
        </mesh>
      </group>

      <group ref={headRef} position={[0, 0.95, 0]}>
        {isBot ? (
          <RoundedBox args={[0.26, 0.26, 0.22]} radius={0.05} smoothness={4} castShadow>
            <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.45} />
          </RoundedBox>
        ) : (
          <mesh castShadow>
            <sphereGeometry args={[0.17, 20, 20]} />
            <meshStandardMaterial color={skin} roughness={0.55} metalness={0.02} />
          </mesh>
        )}

        {!isBot && <Hair style={appearance.hair.style} color={appearance.hair.color} />}

        {isBot ? <BotFace active={isWorking || isWalking} /> : <HumanFace skin={skin} />}

        {appearance.accessories.glasses && !isBot && (
          <mesh position={[0, 0.02, 0.15]}>
            <torusGeometry args={[0.09, 0.008, 8, 24]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
          </mesh>
        )}

        {isBot && (
          <mesh position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={isWorking ? 1.2 : 0.3} />
          </mesh>
        )}
      </group>

      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.24, 32]} />
        <meshBasicMaterial
          color={isWorking || isWalking ? '#4ade80' : '#64748b'}
          transparent
          opacity={isWorking || isWalking ? 0.85 : 0.4}
        />
      </mesh>

      <group position={[0, 0.02, 0.42]} rotation={[-Math.PI / 2.8, 0, 0]}>
        <RoundedBox args={[0.55, 0.22, 0.02]} radius={0.01} smoothness={2}>
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </RoundedBox>
        <Text position={[0, 0.04, 0.015]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.07} color="#f8fafc" anchorX="center" anchorY="middle" maxWidth={0.5}>
          {name}
        </Text>
        {subtitle ? (
          <Text position={[0, -0.04, 0.015]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.045} color="#94a3b8" anchorX="center" anchorY="middle" maxWidth={0.5}>
            {subtitle}
          </Text>
        ) : null}
      </group>

      {showBubble && bubbleText ? <SpeechBubble text={bubbleText} /> : null}
    </group>
  );
}

export { SpeechBubble, truncateText };