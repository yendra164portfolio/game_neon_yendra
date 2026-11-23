import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { EmployeeProfile } from '../office/types';
import { AvatarMesh } from './AvatarMesh';
import {
  createAcousticWallTexture,
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
  onSelect: (id: EmployeeProfile['id']) => void;
  shadowTexture: THREE.CanvasTexture;
}

export const WorkstationPod: React.FC<WorkstationPodProps> = ({
  employee,
  seedOffset,
  selected,
  onSelect,
  shadowTexture,
}) => {
  const [hovered, setHovered] = useState(false);

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

  const isVideoBay = employee.id === 'video_editor';

  return (
    <group
      position={employee.deskPosition}
      rotation={[0, employee.deskRotationY, 0]}
    >
      {/* Contact shadow grounding disc under workstation */}
      <mesh
        position={[0, 0.015, 0.12]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[2.5, 2.2]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>

      {/* Selection / Hover Ring on floor */}
      {(selected || hovered) && (
        <mesh position={[0, 0.024, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.18, 1.28, 36]} />
          <meshBasicMaterial
            color={selected ? '#3b82f6' : '#94a3b8'}
            transparent
            opacity={selected ? 0.9 : 0.55}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Invisible Raycast Hitbox for snappy click/hover */}
      <mesh
        position={[0, 0.9, 0.1]}
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
        <boxGeometry args={[2.1, 1.9, 1.9]} />
        <meshBasicMaterial />
      </mesh>

      {/* Desk Top (matte architectural walnut/oak) */}
      <mesh position={[0, 0.75, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[1.95, 0.06, 0.88]} />
        <meshStandardMaterial color="#d6c5ae" roughness={0.62} metalness={0.04} />
      </mesh>
      {/* Desk Front Accent Trim / Status Light Bar */}
      <mesh position={[0, 0.745, 0.1]}>
        <boxGeometry args={[1.45, 0.025, 0.02]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.85}
          roughness={0.3}
        />
      </mesh>
      {/* Steel Desk Legs (4 legs + modesty crossbar) */}
      {[
        [-0.88, 0.36, -0.72],
        [0.88, 0.36, -0.72],
        [-0.88, 0.36, 0.02],
        [0.88, 0.36, 0.02],
      ].map(([lx, ly, lz], idx) => (
        <mesh key={idx} position={[lx, ly, lz]} castShadow>
          <boxGeometry args={[0.055, 0.72, 0.055]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, 0.24, -0.72]} castShadow>
        <boxGeometry args={[1.76, 0.04, 0.04]} />
        <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.75} />
      </mesh>

      {/* Monitor(s) */}
      {isVideoBay ? (
        // Dual studio monitors for AI Video Editor
        <group position={[0, 0.78, -0.58]}>
          {/* Dual monitor arm */}
          <mesh position={[0, 0.18, -0.06]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.36, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[-0.44, 0.34, 0.02]} rotation={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.82, 0.48, 0.035]} />
            <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.65} />
          </mesh>
          <mesh position={[-0.43, 0.34, 0.04]} rotation={[0, 0.18, 0]}>
            <planeGeometry args={[0.76, 0.42]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffffff"
              emissiveIntensity={0.48}
              roughness={0.18}
            />
          </mesh>
          <mesh position={[0.44, 0.34, 0.02]} rotation={[0, -0.18, 0]} castShadow>
            <boxGeometry args={[0.82, 0.48, 0.035]} />
            <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.65} />
          </mesh>
          <mesh position={[0.43, 0.34, 0.04]} rotation={[0, -0.18, 0]}>
            <planeGeometry args={[0.76, 0.42]} />
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
        // Single widescreen aluminum display
        <group position={[0, 0.78, -0.56]}>
          <mesh position={[0, 0.015, 0]} castShadow>
            <boxGeometry args={[0.24, 0.02, 0.18]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.16, -0.04]} castShadow>
            <boxGeometry args={[0.06, 0.3, 0.03]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.33, 0]} castShadow>
            <boxGeometry args={[0.92, 0.5, 0.035]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.33, 0.02]}>
            <planeGeometry args={[0.86, 0.44]} />
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

      {/* Mechanical Keyboard & Mouse */}
      <mesh position={[-0.08, 0.79, -0.22]} castShadow>
        <boxGeometry args={[0.42, 0.022, 0.15]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0.24, 0.79, -0.22]} castShadow>
        <boxGeometry args={[0.075, 0.024, 0.115]} />
        <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.4} />
      </mesh>

      {/* Ceramic Coffee Mug */}
      <group position={[-0.68, 0.78, -0.24]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
          <meshStandardMaterial color={employee.appearance.accentColor} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.038, 12]} />
          <meshStandardMaterial color="#3e2723" roughness={0.2} />
        </mesh>
      </group>

      {/* Articulated Desk Lamp */}
      <group position={[0.72, 0.78, -0.5]}>
        <mesh position={[0, 0.015, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.03, 14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.38, 10]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.37, 0.08]} rotation={[0.6, 0, 0]} castShadow>
          <coneGeometry args={[0.07, 0.12, 14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.65} />
        </mesh>
      </group>

      {/* Ergonomic Office Chair (positioned at z = 0.45 facing desk) */}
      <group position={[0, 0, 0.45]} rotation={[0, Math.PI, 0]}>
        {/* 5-star caster base */}
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.28, 0.06, 5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.75} />
        </mesh>
        {/* Pneumatic column */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.032, 0.34, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
        </mesh>
        {/* Contoured seat cushion */}
        <mesh position={[0, 0.43, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 0.08, 0.46]} />
          <meshStandardMaterial color="#1e293b" roughness={0.85} />
        </mesh>
        {/* Lumbar backrest */}
        <mesh position={[0, 0.76, -0.22]} rotation={[-0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.44, 0.56, 0.06]} />
          <meshStandardMaterial color="#1e293b" roughness={0.85} />
        </mesh>
        {/* Armrests */}
        <mesh position={[-0.26, 0.6, 0.02]} castShadow>
          <boxGeometry args={[0.05, 0.04, 0.28]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>
        <mesh position={[0.26, 0.6, 0.02]} castShadow>
          <boxGeometry args={[0.05, 0.04, 0.28]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>

        {/* Seated AI Employee Avatar */}
        <AvatarMesh
          appearance={employee.appearance}
          status={employee.status}
          seedOffset={seedOffset}
        />
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
        <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
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

  const acousticTex = useMemo(
    () => createAcousticWallTexture(maxAnisotropy),
    [maxAnisotropy],
  );
  const meetingRugTex = useMemo(
    () => createRugTexture('#1e293b', '#3b82f6'),
    [],
  );
  const loungeRugTex = useMemo(
    () => createRugTexture('#273244', '#14b8a6'),
    [],
  );
  const whiteboardTex = useMemo(() => createWhiteboardTexture(), []);

  useEffect(() => {
    return () => {
      floorMap.dispose();
      floorBump.dispose();
      acousticTex.dispose();
      meetingRugTex.dispose();
      loungeRugTex.dispose();
      whiteboardTex.dispose();
    };
  }, [floorMap, floorBump, acousticTex, meetingRugTex, loungeRugTex, whiteboardTex]);

  return (
    <group>
      {/* Main Architectural Oak Floor Slab (16m x 12m) */}
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[16.2, 0.16, 12.2]} />
        <meshStandardMaterial
          map={floorMap}
          bumpMap={floorBump}
          bumpScale={0.012}
          color="#ffffff"
          roughness={0.55}
          metalness={0.04}
        />
      </mesh>

      {/* Outer Slate Architectural Plinth */}
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[16.8, 0.14, 12.8]} />
        <meshStandardMaterial color="#0f172a" roughness={0.65} metalness={0.2} />
      </mesh>

      {/* North Cutaway Wall with Panoramic Daylight Windows (z = -6) */}
      <group position={[0, 0, -6.05]}>
        {/* Lower wainscot wall */}
        <mesh position={[0, 0.55, 0]} receiveShadow castShadow>
          <boxGeometry args={[16.2, 1.1, 0.22]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
        </mesh>
        {/* Top lintel beam */}
        <mesh position={[0, 3.15, 0]} receiveShadow castShadow>
          <boxGeometry args={[16.2, 0.45, 0.22]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
        </mesh>
        {/* Window Pillars / Mullions */}
        {[-7.85, -3.9, 0.05, 2.2, 7.85].map((wx, idx) => (
          <mesh key={idx} position={[wx, 2.0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.32, 2.1, 0.24]} />
            <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.65} />
          </mesh>
        ))}
        {/* Glass Panes */}
        <mesh position={[-5.85, 2.02, 0]}>
          <boxGeometry args={[3.6, 1.85, 0.04]} />
          <meshPhysicalMaterial
            color="#bae6fd"
            transparent
            opacity={0.28}
            roughness={0.08}
            metalness={0.1}
          />
        </mesh>
        <mesh position={[-1.9, 2.02, 0]}>
          <boxGeometry args={[3.6, 1.85, 0.04]} />
          <meshPhysicalMaterial
            color="#bae6fd"
            transparent
            opacity={0.28}
            roughness={0.08}
            metalness={0.1}
          />
        </mesh>
        {/* Exterior Daylight Sky Backdrop behind North Windows */}
        <mesh position={[-2.0, 2.02, -0.4]}>
          <planeGeometry args={[11.6, 2.2]} />
          <meshBasicMaterial color="#cbd5e1" />
        </mesh>
        {/* Acoustic Slats Accent Panel inside Manager Wall */}
        <mesh position={[-5.8, 1.8, 0.13]} receiveShadow>
          <boxGeometry args={[2.2, 1.9, 0.04]} />
          <meshStandardMaterial map={acousticTex} roughness={0.7} />
        </mesh>
      </group>

      {/* West Cutaway Wall with Window (x = -8.05) */}
      <group position={[-8.05, 0, 0]}>
        <mesh position={[0, 0.55, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, 1.1, 12.2]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
        </mesh>
        <mesh position={[0, 3.15, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, 0.45, 12.2]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
        </mesh>
        {[-5.9, -1.8, 2.2, 5.9].map((wz, idx) => (
          <mesh key={idx} position={[0, 2.0, wz]} castShadow>
            <boxGeometry args={[0.24, 2.1, 0.32]} />
            <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.65} />
          </mesh>
        ))}
        <mesh position={[0, 2.02, 0.2]}>
          <boxGeometry args={[0.04, 1.85, 7.6]} />
          <meshPhysicalMaterial
            color="#bae6fd"
            transparent
            opacity={0.28}
            roughness={0.08}
          />
        </mesh>
      </group>

      {/* MEETING ROOM (North-East Zone: x: 2.2..7.8, z: -5.8..-1.1) */}
      <group>
        {/* Meeting Room Rug (offset >= 0.02 on Y) */}
        <mesh position={[5.0, 0.022, -3.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[4.8, 3.9]} />
          <meshStandardMaterial map={meetingRugTex} roughness={0.9} />
        </mesh>

        {/* Glass Partition Walls with Aluminum Mullions */}
        {/* West glass partition */}
        <mesh position={[2.25, 1.4, -3.5]}>
          <boxGeometry args={[0.04, 2.75, 4.4]} />
          <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.2} roughness={0.1} />
        </mesh>
        <mesh position={[2.25, 2.8, -3.5]}>
          <boxGeometry args={[0.08, 0.08, 4.6]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* South glass partition with open doorway */}
        <mesh position={[3.6, 1.4, -1.2]}>
          <boxGeometry args={[2.6, 2.75, 0.04]} />
          <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.2} roughness={0.1} />
        </mesh>
        <mesh position={[6.7, 1.4, -1.2]}>
          <boxGeometry args={[2.0, 2.75, 0.04]} />
          <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.2} roughness={0.1} />
        </mesh>
        <mesh position={[5.0, 2.8, -1.2]}>
          <boxGeometry args={[5.5, 0.08, 0.08]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Conference Table */}
        <mesh position={[5.0, 0.76, -3.5]} castShadow receiveShadow>
          <boxGeometry args={[2.7, 0.07, 1.25]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
        </mesh>
        <mesh position={[4.1, 0.38, -3.5]} castShadow>
          <cylinderGeometry args={[0.08, 0.14, 0.74, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[5.9, 0.38, -3.5]} castShadow>
          <cylinderGeometry args={[0.08, 0.14, 0.74, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* 4 Conference Chairs */}
        {[
          [4.2, -4.35, 0],
          [5.8, -4.35, 0],
          [4.2, -2.65, Math.PI],
          [5.8, -2.65, Math.PI],
        ].map(([cx, cz, rotY], idx) => (
          <group key={idx} position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
            <mesh position={[0, 0.22, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.22, 0.42, 6]} />
              <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.75} />
            </mesh>
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[0.42, 0.07, 0.4]} />
              <meshStandardMaterial color="#3b82f6" roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.72, -0.18]} castShadow>
              <boxGeometry args={[0.4, 0.46, 0.06]} />
              <meshStandardMaterial color="#1e293b" roughness={0.75} />
            </mesh>
          </group>
        ))}

        {/* Wall Whiteboard on North Wall inside Meeting Room */}
        <mesh position={[5.0, 1.85, -5.88]} castShadow>
          <boxGeometry args={[3.2, 1.5, 0.05]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[5.0, 1.85, -5.84]}>
          <planeGeometry args={[3.04, 1.36]} />
          <meshStandardMaterial map={whiteboardTex} roughness={0.35} />
        </mesh>
      </group>

      {/* VIDEO PRODUCTION DEPARTMENT STUDIO BAY (Backdrop & Camera Rig around x:0.2, z:2.2) */}
      <group position={[0.2, 0, 0.7]}>
        {/* Acoustic Wood Slat Studio Divider */}
        <mesh position={[0, 1.1, -0.3]} castShadow receiveShadow>
          <boxGeometry args={[2.7, 2.2, 0.1]} />
          <meshStandardMaterial map={acousticTex} roughness={0.68} />
        </mesh>
        {/* Illuminated Studio Sign Bar */}
        <mesh position={[0, 2.02, -0.23]}>
          <boxGeometry args={[1.6, 0.14, 0.04]} />
          <meshStandardMaterial
            color="#6366f1"
            emissive="#6366f1"
            emissiveIntensity={0.65}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* Studio Ring Light & Cinema Camera Tripod near Video Bay */}
      <group position={[-1.65, 0, 2.9]} rotation={[0, 0.55, 0]}>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial
            map={shadowTexture}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        </mesh>
        {/* 3 Tripod Legs */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(ang) * 0.14, 0.22, Math.sin(ang) * 0.14]}
            rotation={[Math.sin(ang) * 0.48, 0, -Math.cos(ang) * 0.48]}
            castShadow
          >
            <cylinderGeometry args={[0.012, 0.012, 0.52, 8]} />
            <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.028, 1.25, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Cinema Camera Body inside Ring Light */}
        <mesh position={[0, 1.48, -0.05]} castShadow>
          <boxGeometry args={[0.14, 0.12, 0.18]} />
          <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.48, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.08, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
        </mesh>
        <mesh position={[0, 1.56, 0.02]}>
          <torusGeometry args={[0.22, 0.025, 10, 24]} />
          <meshStandardMaterial
            color="#f8fafc"
            emissive="#e0f2fe"
            emissiveIntensity={0.9}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* LOUNGE & DECORATION ZONE (South-West & North-Center) */}
      <group position={[-5.8, 0, 4.4]}>
        <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.9, 2.1]} />
          <meshStandardMaterial map={loungeRugTex} roughness={0.92} />
        </mesh>
        {/* Lounge Sofa */}
        <group position={[-0.4, 0, 0.3]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.34, 0.72]} />
            <meshStandardMaterial color="#334155" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.52, 0.28]} castShadow>
            <boxGeometry args={[1.6, 0.42, 0.16]} />
            <meshStandardMaterial color="#334155" roughness={0.82} />
          </mesh>
          <mesh position={[-0.72, 0.42, 0]} castShadow>
            <boxGeometry args={[0.16, 0.32, 0.72]} />
            <meshStandardMaterial color="#475569" roughness={0.82} />
          </mesh>
          <mesh position={[0.72, 0.42, 0]} castShadow>
            <boxGeometry args={[0.16, 0.32, 0.72]} />
            <meshStandardMaterial color="#475569" roughness={0.82} />
          </mesh>
        </group>
        {/* Coffee Table */}
        <mesh position={[0.55, 0.24, -0.35]} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.04, 20]} />
          <meshStandardMaterial color="#d6c5ae" roughness={0.5} />
        </mesh>
        <mesh position={[0.55, 0.12, -0.35]} castShadow>
          <cylinderGeometry args={[0.04, 0.12, 0.22, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.75} />
        </mesh>
      </group>

      {/* Bookshelf along West Wall */}
      <group position={[-7.55, 0, -0.7]}>
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 1.8, 1.5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        {/* Book rows */}
        {[0.38, 0.88, 1.38].map((by, rIdx) => (
          <group key={rIdx} position={[0.05, by, 0]}>
            {[-0.45, -0.22, 0.05, 0.28, 0.48].map((bz, bIdx) => (
              <mesh key={bIdx} position={[0, 0.14, bz]} castShadow>
                <boxGeometry args={[0.24, 0.26, 0.12]} />
                <meshStandardMaterial
                  color={['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#64748b'][(rIdx + bIdx) % 5]}
                  roughness={0.7}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Water Dispenser near West Wall */}
      <group position={[-7.45, 0, 1.6]}>
        <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 1.04, 0.4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.24, 0]}>
          <cylinderGeometry args={[0.14, 0.15, 0.38, 14]} />
          <meshPhysicalMaterial color="#38bdf8" transparent opacity={0.45} roughness={0.1} />
        </mesh>
      </group>

      {/* Potted Plants around the office */}
      <PottedPlant position={[-7.1, 0, -5.1]} scale={1.1} shadowTexture={shadowTexture} />
      <PottedPlant position={[1.45, 0, -5.2]} scale={0.95} shadowTexture={shadowTexture} />
      <PottedPlant position={[7.0, 0, -0.3]} scale={1.05} shadowTexture={shadowTexture} />
      <PottedPlant position={[7.1, 0, 5.1]} scale={1.15} shadowTexture={shadowTexture} />
      <PottedPlant position={[-2.6, 0, 4.9]} scale={0.9} shadowTexture={shadowTexture} />
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
