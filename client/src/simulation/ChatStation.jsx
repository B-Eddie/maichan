import { useState, useEffect, useRef } from 'react';
import FurniturePiece from './FurniturePiece';
import AgentCharacter, { SpeechBubble, truncateText } from './AgentCharacter';

// draft mode formatting text
function formatDraftSpeech(station) {
  if (station.isGenerating) return 'Thinking…';
  if (!station.hasDraft) return '';

  const parts = [];
  if (station.draftText) parts.push(station.draftText);

  for (const action of station.draftActions || []) {
    if (action.type === 'reaction') parts.push(`↩ ${action.emoji}`);
    else if (action.label) parts.push(action.label);
  }

  return parts.join('\n') || 'Draft ready';
}

export default function ChatStation({ station, index, onOpenChat, onWalkComplete }) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const baseX = col * 5.5 - 5.5;
  const baseZ = row * 5 - 2.5;

  const isActive = station.isActive;
  const botHome = [-0.55, 0, 1.1];
  const botSpawnLocal = [-2.5, 0, 2.8];

  const [walkFrom, setWalkFrom] = useState(null);
  const alertedRef = useRef(false);

  // start walking animation
  useEffect(() => {
    if (station.hasNewMessage && !alertedRef.current) {
      alertedRef.current = true;
      setWalkFrom(botSpawnLocal);
    }
    if (!station.hasNewMessage) {
      alertedRef.current = false;
    }
  }, [station.hasNewMessage]);

  const handleWalkComplete = () => {
    setWalkFrom(null);
    onWalkComplete?.(station.chatId);
  };

  const botSpeech = formatDraftSpeech(station);
  const showBotBubble = station.hasDraft || station.isGenerating;
  const incomingBubble = station.lastIncoming || station.incomingText;
  const outgoingBubble = station.hasDraft ? null : station.lastOutgoing;

  // go to chat
  const handleDeskClick = (e) => {
    e.stopPropagation();
    onOpenChat?.(station.chatId);
  };

  return (
    <group position={[baseX, 0, baseZ]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        receiveShadow
        onClick={handleDeskClick}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[4.8, 4.2]} />
        <meshStandardMaterial color={isActive ? '#2a3f5f' : '#1e293b'} />
      </mesh>

      <FurniturePiece type="desk" position={[0, 0, 0]} />
      <FurniturePiece type="chair" position={[-0.55, 0, 0.55]} rotation={[0, Math.PI, 0]} />
      <FurniturePiece type="computer" position={[0, 0, -0.15]} />
      <FurniturePiece type="plant" position={[1.4, 0, 0.8]} />

      {incomingBubble && (
        <group position={[0.85, 0, 0.5]}>
          <SpeechBubble text={truncateText(incomingBubble, 50)} y={1.05} color="#14532d" textColor="#dcfce7" />
        </group>
      )}

      {outgoingBubble && !showBotBubble && (
        <group position={[-0.55, 0, 0.3]}>
          <SpeechBubble text={truncateText(outgoingBubble, 50)} y={1.05} color="#1e3a5f" textColor="#dbeafe" />
        </group>
      )}

      <AgentCharacter
        seed={`bot-${station.chatId}`}
        name="You (bot)"
        subtitle={station.isCustom ? 'Custom rules' : 'Global rules'}
        color="#7090ff"
        position={botHome}
        rotationY={Math.PI}
        state={isActive ? 'working' : 'standing'}
        showBubble={showBotBubble}
        bubbleText={botSpeech}
        walkFrom={walkFrom}
        onWalkComplete={handleWalkComplete}
      />

      <AgentCharacter
        seed={`contact-${station.chatId}`}
        name={station.chatName}
        subtitle="Contact"
        color="#34d399"
        position={[0.85, 0, 1.35]}
        rotationY={Math.PI * 1.15}
        state={isActive ? 'working' : 'standing'}
      />
    </group>
  );
}
