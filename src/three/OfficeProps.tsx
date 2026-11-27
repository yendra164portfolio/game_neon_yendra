import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveValidSeatPosition } from '../office/officeEngine';
import type { AgentId, EmployeeProfile } from '../office/types';
import { AvatarMesh } from './AvatarMesh';
import {
  createBulletinBoardTexture,
  createClockFaceTexture,
  createContactShadowTexture,
  createOakFloorTexture,
  createRugTexture,
  createScreenTexture,
  createWhiteboardTexture,
} from './proceduralTextures';

interface WorkstationPodProps {
  employee: EmployeeProfile;
  seedOffset: number;
  selected: boolean;
  hideAvatar?: boolean;
  isMovingSeat?: boolean;
  disableSelect?: boolean;
  onSelect: (id: EmployeeProfile['id']) => void;
  shadowTexture: THREE.CanvasTexture;
}

export const WorkstationPod: React.FC<WorkstationPodProps> = ({
  employee,
  seedOffset,
  selected,
  hideAvatar = false,
  isMovingSeat = false,
  disableSelect = false,
  onSelect,
  shadowTexture,
}) => {
  const [hovered, setHovered] = useState(false);
  const podGroupRef = useRef<THREE.Group>(null);
  const initializedRef = useRef(false);

  useFrame((_, rawDelta) => {
    const grp = podGroupRef.current;
    if (!grp) return;
    if (!initializedRef.current) {
      grp.position.set(...employee.deskPosition);
      grp.rotation.y = employee.deskRotationY;
      initializedRef.current = true;
      return;
    }
    const dt = Math.min(rawDelta, 0.08);
    grp.position.x = THREE.MathUtils.damp(grp.position.x, employee.deskPosition[0], 10, dt);
    grp.position.z = THREE.MathUtils.damp(grp.position.z, employee.deskPosition[2], 10, dt);
    const diffY =
      ((employee.deskRotationY - grp.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    grp.rotation.y += diffY * (1 - Math.exp(-10 * dt));
  });

  const screenTexture = useMemo(
    () =>
      createScreenTexture(
        employee.id,
        employee.status,
        employee.appearance.accentColor,
      ),
    [employee.id, employee.status, employee.appearance.accentColor],
  );

  useEffect(() => {
    return () => {
      screenTexture.dispose();
    };
  }, [screenTexture]);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered]);

  const statusColor =
    employee.status === 'Working'
      ? '#3b82f6'
      : employee.status === 'Thinking'
        ? '#f59e0b'
        : employee.status === 'Completed'
          ? '#10b981'
          : employee.status === 'Error'
            ? '#ef4444'
            : '#64748b';

  const isTeacher = employee.id === 'manager';
  const isVideoBay = employee.id === 'video_editor';

  const deskWidth = isTeacher ? 2.25 : 1.56;
  const deskDepth = isTeacher ? 0.92 : 0.78;
  const deskTopY = isTeacher ? 0.76 : 0.69;
  const deskWoodColor = isTeacher ? '#92623c' : '#e6cfa9';
  const deskTrimColor = isTeacher ? '#6d4426' : '#cbb089';
  const chairSeatY = isTeacher ? 0.43 : 0.37;
  const avatarScale = isTeacher ? 1.04 : 0.92;

  const legX = deskWidth * 0.44;
  const legZFront = -0.35 + deskDepth * 0.42;
  const legZBack = -0.35 - deskDepth * 0.42;

  return (
    <group
      ref={podGroupRef}
      position={employee.deskPosition}
      rotation={[0, employee.deskRotationY, 0]}
    >
      {/* Contact shadow grounding disc under desk & chair */}
      <mesh
        position={[0, 0.015, 0.08]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[isTeacher ? 2.8 : 2.1, isTeacher ? 2.3 : 1.9]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.44}
          depthWrite={false}
        />
      </mesh>

      {/* Selection / Hover / Move-Mode Ring on floor */}
      {(selected || hovered || isMovingSeat) && (
        <mesh position={[0, 0.024, 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[isTeacher ? 1.25 : 0.98, isTeacher ? 1.36 : 1.08, 36]} />
          <meshBasicMaterial
            color={isMovingSeat ? '#f59e0b' : selected ? '#3b82f6' : '#94a3b8'}
            transparent
            opacity={isMovingSeat || selected ? 0.92 : 0.55}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Invisible Raycast Hitbox for snappy click/hover (bypassed in Move Seat mode) */}
      {!disableSelect && (
        <mesh
          position={[0, 0.88, 0.08]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(employee.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          visible={false}
        >
          <boxGeometry args={[deskWidth + 0.25, 1.85, 1.75]} />
          <meshBasicMaterial />
        </mesh>
      )}

      {/* Classroom Desk Top */}
      <mesh position={[0, deskTopY, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[deskWidth, 0.055, deskDepth]} />
        <meshStandardMaterial color={deskWoodColor} roughness={0.62} metalness={0.04} />
      </mesh>

      {/* Tidy Front Modesty Panel (gives neat classroom row silhouette) */}
      <mesh position={[0, deskTopY - 0.24, -0.35 - deskDepth * 0.42]} castShadow receiveShadow>
        <boxGeometry args={[deskWidth - 0.14, 0.42, 0.03]} />
        <meshStandardMaterial color={deskTrimColor} roughness={0.72} metalness={0.03} />
      </mesh>

      {/* Subtle Status Accent Strip along Desk Front */}
      <mesh position={[0, deskTopY - 0.005, -0.35 - deskDepth * 0.45]}>
        <boxGeometry args={[deskWidth * 0.65, 0.022, 0.02]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.75}
          roughness={0.3}
        />
      </mesh>

      {/* Crisp Steel Desk Legs (4 legs + tidy crossbar) */}
      {[
        [-legX, deskTopY * 0.48, legZBack],
        [legX, deskTopY * 0.48, legZBack],
        [-legX, deskTopY * 0.48, legZFront],
        [legX, deskTopY * 0.48, legZFront],
      ].map(([lx, ly, lz], idx) => (
        <mesh key={idx} position={[lx, ly, lz]} castShadow>
          <boxGeometry args={[0.05, deskTopY - 0.04, 0.05]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, legZBack]} castShadow>
        <boxGeometry args={[deskWidth - 0.22, 0.035, 0.035]} />
        <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.75} />
      </mesh>

      {/* Monitor(s) */}
      {isVideoBay ? (
        // Compact dual studio monitors for Video Editor student
        <group position={[0, deskTopY + 0.028, -0.56]}>
          <mesh position={[0, 0.16, -0.05]} castShadow>
            <cylinderGeometry args={[0.028, 0.032, 0.32, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[-0.36, 0.3, 0.02]} rotation={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[0.66, 0.4, 0.032]} />
            <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.65} />
          </mesh>
          <mesh position={[-0.355, 0.3, 0.038]} rotation={[0, 0.14, 0]}>
            <planeGeometry args={[0.61, 0.35]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffffff"
              emissiveIntensity={0.48}
              roughness={0.18}
            />
          </mesh>
          <mesh position={[0.36, 0.3, 0.02]} rotation={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[0.66, 0.4, 0.032]} />
            <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.65} />
          </mesh>
          <mesh position={[0.355, 0.3, 0.038]} rotation={[0, -0.14, 0]}>
            <planeGeometry args={[0.61, 0.35]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffffff"
              emissiveIntensity={0.48}
              roughness={0.18}
            />
          </mesh>
        </group>
      ) : (
        // Slim Classroom Display
        <group position={[isTeacher ? -0.35 : 0, deskTopY + 0.028, -0.54]}>
          <mesh position={[0, 0.014, 0]} castShadow>
            <boxGeometry args={[0.22, 0.018, 0.16]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.145, -0.04]} castShadow>
            <boxGeometry args={[0.05, 0.26, 0.028]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.29, 0]} castShadow>
            <boxGeometry args={[0.8, 0.44, 0.032]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.29, 0.018]}>
            <planeGeometry args={[0.74, 0.38]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffffff"
              emissiveIntensity={0.45}
              roughness={0.18}
            />
          </mesh>
        </group>
      )}

      {/* Keyboard & Mouse */}
      <mesh position={[isTeacher ? -0.38 : -0.08, deskTopY + 0.038, -0.2]} castShadow>
        <boxGeometry args={[0.38, 0.02, 0.13]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[isTeacher ? -0.08 : 0.2, deskTopY + 0.038, -0.2]} castShadow>
        <boxGeometry args={[0.068, 0.022, 0.1]} />
        <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.4} />
      </mesh>

      {isTeacher ? (
        // Teacher Desk Accessories: Stack of Textbooks + Pen Cup + Teacher Nameplate
        <group>
          {/* Stack of 3 Classroom Textbooks */}
          <group position={[0.58, deskTopY + 0.028, -0.35]}>
            <mesh position={[0, 0.022, 0]} rotation={[0, 0.06, 0]} castShadow>
              <boxGeometry args={[0.32, 0.04, 0.24]} />
              <meshStandardMaterial color="#1d4ed8" roughness={0.7} />
            </mesh>
            <mesh position={[0.01, 0.06, 0]} rotation={[0, -0.08, 0]} castShadow>
              <boxGeometry args={[0.3, 0.036, 0.22]} />
              <meshStandardMaterial color="#0f766e" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.095, 0]} rotation={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[0.28, 0.032, 0.21]} />
              <meshStandardMaterial color="#b45309" roughness={0.7} />
            </mesh>
          </group>

          {/* Teacher Pen Cup */}
          <group position={[0.88, deskTopY + 0.028, -0.52]}>
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
            </mesh>
            <mesh position={[-0.01, 0.12, 0]} rotation={[0.1, 0, 0.15]}>
              <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
              <meshStandardMaterial color="#ef4444" roughness={0.4} />
            </mesh>
            <mesh position={[0.015, 0.125, 0.01]} rotation={[-0.12, 0, -0.1]}>
              <cylinderGeometry args={[0.008, 0.008, 0.13, 8]} />
              <meshStandardMaterial color="#3b82f6" roughness={0.4} />
            </mesh>
          </group>

          {/* Teacher Desk Nameplate facing students */}
          <mesh position={[0.52, deskTopY + 0.055, -0.68]} rotation={[-0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.38, 0.07, 0.04]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      ) : (
        // Student Desk Accessories: Tidy Notebook & Pencil + Accent Bottle
        <group>
          {/* Open Notebook */}
          <mesh position={[-0.5, deskTopY + 0.034, -0.22]} rotation={[0, 0.08, 0]} castShadow>
            <boxGeometry args={[0.24, 0.016, 0.18]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </mesh>
          {/* Accent Pencil */}
          <mesh
            position={[-0.36, deskTopY + 0.044, -0.22]}
            rotation={[Math.PI / 2, 0, 0.15]}
            castShadow
          >
            <cylinderGeometry args={[0.007, 0.007, 0.15, 8]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          {/* Student Tumbler / Bottle */}
          <mesh position={[0.56, deskTopY + 0.085, -0.45]} castShadow>
            <cylinderGeometry args={[0.038, 0.038, 0.12, 12]} />
            <meshStandardMaterial color={employee.appearance.accentColor} roughness={0.35} />
          </mesh>
        </group>
      )}

      {/* Classroom Chair (positioned at z = 0.45 facing desk) */}
      <group position={[0, 0, 0.45]} rotation={[0, Math.PI, 0]}>
        {/* Base */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.038, 0.25, 0.05, isTeacher ? 5 : 4]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.75} />
        </mesh>
        {/* Support Column */}
        <mesh position={[0, chairSeatY * 0.52, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, chairSeatY - 0.06, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
        </mesh>
        {/* Seat Cushion */}
        <mesh position={[0, chairSeatY, 0]} castShadow receiveShadow>
          <boxGeometry args={[isTeacher ? 0.5 : 0.43, 0.07, isTeacher ? 0.48 : 0.42]} />
          <meshStandardMaterial
            color={isTeacher ? '#0f172a' : '#1e3a8a'}
            roughness={0.82}
          />
        </mesh>
        {/* Backrest */}
        <mesh
          position={[0, chairSeatY + (isTeacher ? 0.33 : 0.28), -0.2]}
          rotation={[-0.08, 0, 0]}
          castShadow
        >
          <boxGeometry args={[isTeacher ? 0.46 : 0.39, isTeacher ? 0.56 : 0.44, 0.055]} />
          <meshStandardMaterial
            color={isTeacher ? '#0f172a' : '#1e3a8a'}
            roughness={0.82}
          />
        </mesh>
        {/* Teacher Armrests */}
        {isTeacher && (
          <>
            <mesh position={[-0.27, chairSeatY + 0.16, 0.02]} castShadow>
              <boxGeometry args={[0.05, 0.04, 0.28]} />
              <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
            <mesh position={[0.27, chairSeatY + 0.16, 0.02]} castShadow>
              <boxGeometry args={[0.05, 0.04, 0.28]} />
              <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
          </>
        )}

        {/* Seated Teacher / Student Avatar */}
        {!hideAvatar && (
          <AvatarMesh
            appearance={employee.appearance}
            status={employee.status}
            seedOffset={seedOffset}
            scale={avatarScale}
          />
        )}
      </group>
    </group>
  );
};

interface SeatPlacementOverlayProps {
  movingAgentId: AgentId;
  employees: EmployeeProfile[];
  onPlaceSeat: (agentId: AgentId, position: [number, number, number]) => void;
}

export const SeatPlacementOverlay: React.FC<SeatPlacementOverlayProps> = ({
  movingAgentId,
  employees,
  onPlaceSeat,
}) => {
  const movingEmp = employees.find((e) => e.id === movingAgentId);
  const [previewPos, setPreviewPos] = useState<[number, number, number]>(
    movingEmp ? movingEmp.deskPosition : [0, 0, 0],
  );
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (movingEmp) {
      setPreviewPos(movingEmp.deskPosition);
    }
  }, [movingAgentId, movingEmp]);

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const resolved = resolveValidSeatPosition(
      e.point.x,
      e.point.z,
      movingAgentId,
      employees,
    );
    setPreviewPos(resolved);
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDownRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (pointerDownRef.current) {
      const dist = Math.hypot(
        e.nativeEvent.clientX - pointerDownRef.current.x,
        e.nativeEvent.clientY - pointerDownRef.current.y,
      );
      if (dist > 6) return;
    }
    const resolved = resolveValidSeatPosition(
      e.point.x,
      e.point.z,
      movingAgentId,
      employees,
    );
    onPlaceSeat(movingAgentId, resolved);
  };

  const rotY = movingEmp?.deskRotationY ?? 0;

  return (
    <group>
      {/* Classroom Seating Alignment Grid */}
      <gridHelper
        args={[13.6, 17, '#38bdf8', '#1e3a8a']}
        position={[0.1, 0.03, 0.05]}
      />

      {/* Interactive Floor Hit Plane */}
      <mesh
        position={[0.1, 0.032, 0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <planeGeometry args={[13.4, 10.2]} />
        <meshBasicMaterial
          color="#0ea5e9"
          transparent
          opacity={0.07}
          depthWrite={false}
        />
      </mesh>

      {/* Preview Ghost Desk Footprint */}
      <group position={[previewPos[0], 0.04, previewPos[2]]} rotation={[0, rotY, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.98, 1.12, 36]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.9} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.34, -0.35]}>
          <boxGeometry args={[1.56, 0.68, 0.78]} />
          <meshBasicMaterial
            color="#34d399"
            transparent
            opacity={0.28}
            wireframe
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
};

interface PlantProps {
  position: [number, number, number];
  scale?: number;
  shadowTexture: THREE.CanvasTexture;
}

export const PottedPlant: React.FC<PlantProps> = ({
  position,
  scale = 1,
  shadowTexture,
}) => {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.75, 0.75]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
      {/* Ceramic Planter */}
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.44, 16]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.55} />
      </mesh>
      {/* Soil disc */}
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.21, 14]} />
        <meshStandardMaterial color="#3f2e21" roughness={0.95} />
      </mesh>
      {/* Main Stems */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.6, 8]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
      {/* Clustered Leaves */}
      {[
        [0, 1.05, 0, 0.22],
        [-0.18, 0.88, 0.1, 0.18],
        [0.18, 0.92, -0.08, 0.19],
        [0.06, 0.84, 0.19, 0.17],
        [-0.08, 0.98, -0.17, 0.17],
      ].map(([lx, ly, lz, r], idx) => (
        <mesh key={idx} position={[lx, ly, lz]} castShadow>
          <dodecahedronGeometry args={[r, 0]} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? '#15803d' : '#166534'}
            roughness={0.72}
          />
        </mesh>
      ))}
    </group>
  );
};

export const OfficeEnvironmentShell: React.FC<{
  maxAnisotropy: number;
  shadowTexture: THREE.CanvasTexture;
}> = ({ maxAnisotropy, shadowTexture }) => {
  const { floorMap, floorBump } = useMemo(() => {
    const { map, bumpMap } = createOakFloorTexture(maxAnisotropy);
    return { floorMap: map, floorBump: bumpMap };
  }, [maxAnisotropy]);

  const teacherRugTex = useMemo(
    () => createRugTexture('#1e3a5f', '#60a5fa'),
    [],
  );
  const chalkboardTex = useMemo(() => {
    const t = createWhiteboardTexture();
    t.anisotropy = maxAnisotropy;
    return t;
  }, [maxAnisotropy]);
  const bulletinTex = useMemo(() => {
    const t = createBulletinBoardTexture();
    t.anisotropy = maxAnisotropy;
    return t;
  }, [maxAnisotropy]);
  const clockTex = useMemo(() => {
    const t = createClockFaceTexture();
    t.anisotropy = maxAnisotropy;
    return t;
  }, [maxAnisotropy]);

  useEffect(() => {
    return () => {
      floorMap.dispose();
      floorBump.dispose();
      teacherRugTex.dispose();
      chalkboardTex.dispose();
      bulletinTex.dispose();
      clockTex.dispose();
    };
  }, [floorMap, floorBump, teacherRugTex, chalkboardTex, bulletinTex, clockTex]);

  return (
    <group>
      {/* Main Classroom Hardwood Floor Slab (16.2m x 12.2m) */}
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[16.2, 0.16, 12.2]} />
        <meshStandardMaterial
          map={floorMap}
          bumpMap={floorBump}
          bumpScale={0.01}
          color="#ffffff"
          roughness={0.55}
          metalness={0.04}
        />
      </mesh>

      {/* Outer Architectural Plinth */}
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[16.8, 0.14, 12.8]} />
        <meshStandardMaterial color="#0f172a" roughness={0.65} metalness={0.2} />
      </mesh>

      {/* Subtle Front Teacher Zone Rug (offset >= 0.02 on Y) */}
      <mesh position={[0, 0.02, -4.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.2, 2.2]} />
        <meshStandardMaterial map={teacherRugTex} roughness={0.9} />
      </mesh>

      {/* NORTH FRONT CLASSROOM WALL (z = -6.05): Chalkboard, Pinboard, Clock & Cabinet */}
      <group position={[0, 0, -6.05]}>
        {/* Clean Warm-Cream Upper Wall */}
        <mesh position={[0, 2.25, 0]} receiveShadow castShadow>
          <boxGeometry args={[16.2, 2.3, 0.22]} />
          <meshStandardMaterial color="#f1efe9" roughness={0.82} />
        </mesh>
        {/* Lower Classroom Wainscot Wall */}
        <mesh position={[0, 0.55, 0.01]} receiveShadow castShadow>
          <boxGeometry args={[16.2, 1.1, 0.24]} />
          <meshStandardMaterial color="#d9d5cc" roughness={0.78} />
        </mesh>
        {/* Horizontal Wood Chair-Rail Trim */}
        <mesh position={[0, 1.12, 0.12]} castShadow>
          <boxGeometry args={[16.2, 0.08, 0.06]} />
          <meshStandardMaterial color="#785134" roughness={0.6} />
        </mesh>
        {/* Top Lintel Crown Beam */}
        <mesh position={[0, 3.45, 0]} castShadow>
          <boxGeometry args={[16.2, 0.18, 0.28]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.2} />
        </mesh>
      </group>

      {/* MAIN FRAMED CLASSROOM CHALKBOARD (Centered at front x: 0, z: -5.88) */}
      <group position={[0, 2.05, -5.88]}>
        {/* Outer Oak Frame */}
        <mesh castShadow>
          <boxGeometry args={[5.4, 1.92, 0.07]} />
          <meshStandardMaterial color="#785134" roughness={0.58} />
        </mesh>
        {/* Chalkboard Writing Surface */}
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[5.16, 1.72]} />
          <meshStandardMaterial map={chalkboardTex} roughness={0.72} />
        </mesh>
        {/* Chalk Ledge Tray */}
        <mesh position={[0, -0.96, 0.09]} castShadow>
          <boxGeometry args={[5.4, 0.06, 0.14]} />
          <meshStandardMaterial color="#6b4423" roughness={0.55} />
        </mesh>
        {/* Felt Eraser & Chalk Sticks on Ledge */}
        <mesh position={[-1.4, -0.91, 0.1]} castShadow>
          <boxGeometry args={[0.18, 0.045, 0.06]} />
          <meshStandardMaterial color="#1e293b" roughness={0.85} />
        </mesh>
        <mesh position={[-0.95, -0.92, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.09, 8]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </mesh>
        <mesh position={[-0.75, -0.92, 0.1]} rotation={[0, 0.2, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.09, 8]} />
          <meshStandardMaterial color="#fef08a" roughness={0.9} />
        </mesh>
      </group>

      {/* CLASSROOM SCHEDULE & BULLETIN PINBOARD (Front-Left x: -4.8, z: -5.88) */}
      <group position={[-4.8, 2.02, -5.88]}>
        <mesh castShadow>
          <boxGeometry args={[2.55, 1.48, 0.06]} />
          <meshStandardMaterial color="#785134" roughness={0.58} />
        </mesh>
        <mesh position={[0, 0, 0.036]}>
          <planeGeometry args={[2.38, 1.32]} />
          <meshStandardMaterial map={bulletinTex} roughness={0.82} />
        </mesh>
      </group>

      {/* CLASSROOM WALL CLOCK (Front-Right x: 4.15, y: 2.55, z: -5.88) */}
      <group position={[4.15, 2.55, -5.88]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.06, 28]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.65} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <circleGeometry args={[0.35, 28]} />
          <meshStandardMaterial map={clockTex} roughness={0.35} />
        </mesh>
      </group>

      {/* TIDY CLASSROOM CABINET & OPEN DISPLAY SHELF (North-East corner x: 5.9, z: -5.52) */}
      <group position={[5.9, 0, -5.52]}>
        {/* Lower Closed Cabinet */}
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.9, 0.62]} />
          <meshStandardMaterial color="#d6c5ae" roughness={0.62} />
        </mesh>
        {/* Cabinet Doors */}
        {[-0.58, 0.58].map((dx, idx) => (
          <mesh key={idx} position={[dx, 0.45, 0.32]}>
            <boxGeometry args={[1.12, 0.78, 0.02]} />
            <meshStandardMaterial color="#c4af92" roughness={0.68} />
          </mesh>
        ))}
        {/* Open Upper Bookshelf Frame (back + left/right walls + middle/top shelves) */}
        <mesh position={[0, 1.38, -0.22]} castShadow receiveShadow>
          <boxGeometry args={[2.32, 0.96, 0.05]} />
          <meshStandardMaterial color="#785134" roughness={0.62} />
        </mesh>
        <mesh position={[-1.12, 1.38, -0.02]} castShadow>
          <boxGeometry args={[0.06, 0.96, 0.44]} />
          <meshStandardMaterial color="#785134" roughness={0.62} />
        </mesh>
        <mesh position={[1.12, 1.38, -0.02]} castShadow>
          <boxGeometry args={[0.06, 0.96, 0.44]} />
          <meshStandardMaterial color="#785134" roughness={0.62} />
        </mesh>
        <mesh position={[0, 1.38, -0.02]} castShadow>
          <boxGeometry args={[0.05, 0.92, 0.4]} />
          <meshStandardMaterial color="#785134" roughness={0.62} />
        </mesh>
        <mesh position={[0, 1.36, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[2.24, 0.045, 0.42]} />
          <meshStandardMaterial color="#8c6240" roughness={0.58} />
        </mesh>
        <mesh position={[0, 1.84, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[2.34, 0.05, 0.46]} />
          <meshStandardMaterial color="#785134" roughness={0.58} />
        </mesh>
        {/* Neat Standing Books (Lower Left Compartment) */}
        {[-0.92, -0.8, -0.68, -0.56, -0.44].map((bx, i) => (
          <mesh key={i} position={[bx, 1.07, 0.0]} castShadow>
            <boxGeometry args={[0.09, 0.28, 0.24]} />
            <meshStandardMaterial
              color={['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#4338ca'][i]}
              roughness={0.7}
            />
          </mesh>
        ))}
        {/* Neat Standing Binders (Upper Left Compartment) */}
        {[-0.9, -0.74, -0.58].map((bx, i) => (
          <mesh key={`ub-${i}`} position={[bx, 1.54, 0.0]} castShadow>
            <boxGeometry args={[0.11, 0.3, 0.24]} />
            <meshStandardMaterial
              color={['#0284c7', '#059669', '#d97706'][i]}
              roughness={0.65}
            />
          </mesh>
        ))}
        {/* Gold Class Trophy & Globe Accent (Right Compartments) */}
        <mesh position={[0.56, 0.99, 0.0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.14, 14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0.56, 1.14, 0.0]} castShadow>
          <cylinderGeometry args={[0.11, 0.045, 0.18, 14]} />
          <meshStandardMaterial color="#facc15" roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh position={[0.56, 1.54, 0.0]} castShadow>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.35} metalness={0.15} />
        </mesh>
      </group>

      {/* WEST CLASSROOM WINDOW WALL (x = -8.05) */}
      <group position={[-8.05, 0, 0]}>
        {/* Lower Wainscot */}
        <mesh position={[0, 0.55, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, 1.1, 12.2]} />
          <meshStandardMaterial color="#d9d5cc" roughness={0.78} />
        </mesh>
        {/* Wood Sill Trim */}
        <mesh position={[0.12, 1.12, 0]} castShadow>
          <boxGeometry args={[0.08, 0.08, 12.2]} />
          <meshStandardMaterial color="#785134" roughness={0.6} />
        </mesh>
        {/* Top Lintel Beam */}
        <mesh position={[0, 3.25, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, 0.58, 12.2]} />
          <meshStandardMaterial color="#f1efe9" roughness={0.82} />
        </mesh>
        {/* Window Pillars */}
        {[-5.9, -2.0, 2.0, 5.9].map((wz, idx) => (
          <mesh key={idx} position={[0, 2.05, wz]} castShadow>
            <boxGeometry args={[0.26, 2.0, 0.36]} />
            <meshStandardMaterial color="#f1efe9" roughness={0.78} />
          </mesh>
        ))}
        {/* Sunlit Classroom Window Panes */}
        {[-3.95, 0, 3.95].map((wz, idx) => (
          <group key={idx} position={[0, 2.04, wz]}>
            <mesh>
              <boxGeometry args={[0.04, 1.82, 3.56]} />
              <meshPhysicalMaterial
                color="#bae6fd"
                transparent
                opacity={0.32}
                roughness={0.08}
              />
            </mesh>
            {/* Slim center mullion bar */}
            <mesh>
              <boxGeometry args={[0.08, 1.84, 0.06]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} />
            </mesh>
          </group>
        ))}
        {/* Bright Exterior Sky Plane outside West Windows */}
        <mesh position={[-0.45, 2.05, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[11.6, 2.1]} />
          <meshBasicMaterial color="#dbeafe" />
        </mesh>
      </group>

      {/* TIDY OPEN STUDENT BOOK CUBBIES ALONG WEST WALL (x: -7.6, z: -0.6) */}
      <group position={[-7.6, 0, -0.6]}>
        {/* Back Board */}
        <mesh position={[-0.2, 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.05, 1.1, 3.3]} />
          <meshStandardMaterial color="#c9b089" roughness={0.68} />
        </mesh>
        {/* Bottom, Middle, and Top Shelf Planks */}
        {[0.05, 0.55, 1.08].map((sy, sIdx) => (
          <mesh key={sIdx} position={[0, sy, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.45, 0.045, 3.3]} />
            <meshStandardMaterial color="#e6cfa9" roughness={0.62} />
          </mesh>
        ))}
        {/* Vertical Dividers */}
        {[-1.62, -0.54, 0.54, 1.62].map((dz, dIdx) => (
          <mesh key={dIdx} position={[0, 0.56, dz]} castShadow>
            <boxGeometry args={[0.44, 1.06, 0.045]} />
            <meshStandardMaterial color="#d4bc96" roughness={0.65} />
          </mesh>
        ))}
        {/* Visible Books & Storage Bins inside Open Cubbies */}
        {[-1.08, 0, 1.08].map((cz, cIdx) => (
          <group key={cIdx} position={[0.02, 0, cz]}>
            {/* Lower Fabric Storage Bin */}
            <mesh position={[0, 0.22, 0]} castShadow>
              <boxGeometry args={[0.32, 0.28, 0.62]} />
              <meshStandardMaterial
                color={['#1e3a8a', '#0f766e', '#334155'][cIdx]}
                roughness={0.85}
              />
            </mesh>
            {/* Upper Row Textbooks */}
            {[-0.22, -0.1, 0.02, 0.14].map((bz, bIdx) => (
              <mesh key={bIdx} position={[0, 0.72, bz]} castShadow>
                <boxGeometry args={[0.26, 0.28, 0.085]} />
                <meshStandardMaterial
                  color={['#3b82f6', '#10b981', '#f59e0b', '#f43f5e'][(cIdx + bIdx) % 4]}
                  roughness={0.7}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Water Dispenser tucked neatly in Back-Left Classroom Corner */}
      <group position={[-7.4, 0, 3.4]}>
        <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 1.04, 0.4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.24, 0]}>
          <cylinderGeometry args={[0.14, 0.15, 0.38, 14]} />
          <meshPhysicalMaterial color="#38bdf8" transparent opacity={0.45} roughness={0.1} />
        </mesh>
      </group>

      {/* Four Symmetrical Corner Potted Plants framing the Classroom */}
      <PottedPlant position={[-7.15, 0, -5.2]} scale={1.05} shadowTexture={shadowTexture} />
      <PottedPlant position={[7.25, 0, -5.2]} scale={1.0} shadowTexture={shadowTexture} />
      <PottedPlant position={[7.25, 0, 5.2]} scale={1.05} shadowTexture={shadowTexture} />
      <PottedPlant position={[-7.15, 0, 5.2]} scale={1.0} shadowTexture={shadowTexture} />
    </group>
  );
};

export function useContactShadowTexture(): THREE.CanvasTexture {
  const tex = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => {
    return () => {
      tex.dispose();
    };
  }, [tex]);
  return tex;
}
