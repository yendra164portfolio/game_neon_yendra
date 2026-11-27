import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type {
  AgentId,
  CameraPresetId,
  EmployeeProfile,
  ManagerPatrolState,
} from '../office/types';
import { getChairWorldSpot } from '../office/officeEngine';
import { AvatarMesh } from './AvatarMesh';
import {
  OfficeEnvironmentShell,
  SeatPlacementOverlay,
  useContactShadowTexture,
  WorkstationPod,
} from './OfficeProps';
import { detectSoftwareGl } from './proceduralTextures';

export interface ProjectedEmployeeTag {
  id: AgentId;
  x: number;
  y: number;
  visible: boolean;
}

interface OfficeSceneProps {
  employees: EmployeeProfile[];
  managerPatrol: ManagerPatrolState;
  selectedEmployeeId: AgentId | null;
  moveSeatAgentId: AgentId | null;
  cameraPreset: CameraPresetId;
  presetVersion: number;
  onSelectEmployee: (id: AgentId) => void;
  onPlaceSeat: (agentId: AgentId, position: [number, number, number]) => void;
  onProjectedLabels: (tags: ProjectedEmployeeTag[]) => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  isometric: { pos: [13.8, 11.4, 13.8], target: [0.0, 0.7, -0.5] },
  manager: { pos: [3.4, 4.3, -0.4], target: [0.0, 1.0, -4.2] },
  video_bay: { pos: [7.2, 5.2, 3.6], target: [0.0, 0.8, -0.7] },
  creative_pod: { pos: [7.2, 5.2, 7.2], target: [0.0, 0.8, 2.6] },
  meeting_room: { pos: [0.0, 2.8, 1.8], target: [0.0, 1.5, -5.6] },
};

const _projVec = new THREE.Vector3();

const RoomEnvironmentSetup: React.FC = () => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTex;
    roomEnv.dispose();
    pmrem.dispose();

    return () => {
      scene.environment = null;
      envTex.dispose();
    };
  }, [gl, scene]);

  return null;
};

const SoftwareGlPacer: React.FC<{ active: boolean }> = ({ active }) => {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timerId = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      const rawGl = gl.getContext() as WebGL2RenderingContext;
      const sync = rawGl.fenceSync?.(rawGl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      rawGl.flush?.();

      const poll = () => {
        if (cancelled) return;
        const status = sync && rawGl.getSyncParameter?.(sync, rawGl.SYNC_STATUS);
        if (status === rawGl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 8);
        } else {
          if (sync) rawGl.deleteSync?.(sync);
          timerId = window.setTimeout(() => {
            if (!cancelled) {
              invalidate();
              scheduleNext();
            }
          }, 95);
        }
      };

      timerId = window.setTimeout(poll, 10);
    };

    invalidate();
    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [active, gl, invalidate]);

  return null;
};

const SceneRig: React.FC<{
  employees: EmployeeProfile[];
  managerPatrol: ManagerPatrolState;
  managerVisualPosRef: React.MutableRefObject<THREE.Vector3>;
  cameraPreset: CameraPresetId;
  presetVersion: number;
  isSoftwareGl: boolean;
  onProjectedLabels: (tags: ProjectedEmployeeTag[]) => void;
}> = ({
  employees,
  managerPatrol,
  managerVisualPosRef,
  cameraPreset,
  presetVersion,
  isSoftwareGl,
  onProjectedLabels,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size } = useThree();

  const transitionActiveRef = useRef(false);
  const desiredPosRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.isometric.pos));
  const desiredTargetRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.isometric.target));
  const lastProjectionReportRef = useRef(0);

  useEffect(() => {
    const preset = CAMERA_PRESETS[cameraPreset];
    desiredPosRef.current.set(...preset.pos);
    desiredTargetRef.current.set(...preset.target);
    transitionActiveRef.current = true;
  }, [cameraPreset, presetVersion]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    const controls = controlsRef.current;

    if (transitionActiveRef.current && controls) {
      const dampLambda = 6.5;
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        desiredPosRef.current.x,
        dampLambda,
        dt,
      );
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        desiredPosRef.current.y,
        dampLambda,
        dt,
      );
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        desiredPosRef.current.z,
        dampLambda,
        dt,
      );

      controls.target.x = THREE.MathUtils.damp(
        controls.target.x,
        desiredTargetRef.current.x,
        dampLambda,
        dt,
      );
      controls.target.y = THREE.MathUtils.damp(
        controls.target.y,
        desiredTargetRef.current.y,
        dampLambda,
        dt,
      );
      controls.target.z = THREE.MathUtils.damp(
        controls.target.z,
        desiredTargetRef.current.z,
        dampLambda,
        dt,
      );

      controls.update();

      const dist =
        camera.position.distanceTo(desiredPosRef.current) +
        controls.target.distanceTo(desiredTargetRef.current);
      if (dist < 0.05) {
        transitionActiveRef.current = false;
      }
    }

    // Throttle projected DOM tag updates (~10Hz)
    const now = state.clock.elapsedTime;
    if (now - lastProjectionReportRef.current >= 0.09) {
      lastProjectionReportRef.current = now;
      const projected: ProjectedEmployeeTag[] = employees.map((emp) => {
        const managerWalking = emp.id === 'manager' && managerPatrol.phase !== 'at_desk';
        let worldX: number;
        let worldY: number;
        let worldZ: number;
        if (managerWalking) {
          worldX = managerVisualPosRef.current.x;
          worldY = 2.45;
          worldZ = managerVisualPosRef.current.z;
        } else {
          const rot = emp.deskRotationY;
          worldX = emp.deskPosition[0] + Math.sin(rot) * 0.45;
          worldY = emp.id === 'manager' ? 1.84 : 1.78;
          worldZ = emp.deskPosition[2] + Math.cos(rot) * 0.45;
        }
        _projVec.set(worldX, worldY, worldZ);
        _projVec.project(camera);

        const inFront = _projVec.z >= -1 && _projVec.z <= 1;
        const x = ((_projVec.x + 1) * 0.5) * size.width;
        const y = ((-_projVec.y + 1) * 0.5) * size.height;

        return {
          id: emp.id,
          x,
          y,
          visible: inFront && x > 40 && x < size.width - 40 && y > 30 && y < size.height - 40,
        };
      });
      onProjectedLabels(projected);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, 0.7, -0.2]}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.07}
      minDistance={6}
      maxDistance={28}
      minPolarAngle={0.28}
      maxPolarAngle={Math.PI / 2.25}
      onStart={() => {
        transitionActiveRef.current = false;
      }}
    />
  );
};

const WalkingManagerActor: React.FC<{
  manager: EmployeeProfile;
  managerPatrol: ManagerPatrolState;
  managerVisualPosRef: React.MutableRefObject<THREE.Vector3>;
  selected: boolean;
  onSelect: (id: AgentId) => void;
  shadowTexture: THREE.CanvasTexture;
}> = ({
  manager,
  managerPatrol,
  managerVisualPosRef,
  selected,
  onSelect,
  shadowTexture,
}) => {
  const actorRef = useRef<THREE.Group>(null);
  const yawRef = useRef<number>(managerPatrol.currentYaw);
  const wasAwayRef = useRef(false);

  const isAway = managerPatrol.phase !== 'at_desk';
  const isWalking =
    managerPatrol.phase === 'walking_to_colleague' ||
    managerPatrol.phase === 'returning_to_desk';

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    const chair = getChairWorldSpot(manager);

    if (!isAway) {
      managerVisualPosRef.current.set(...chair.position);
      yawRef.current = chair.yaw;
      wasAwayRef.current = false;
      return;
    }

    if (!wasAwayRef.current) {
      managerVisualPosRef.current.set(...managerPatrol.currentPos);
      yawRef.current = managerPatrol.currentYaw;
      wasAwayRef.current = true;
    }

    const dest =
      managerPatrol.phase === 'returning_to_desk'
        ? chair.position
        : managerPatrol.targetPos;
    const dx = dest[0] - managerVisualPosRef.current.x;
    const dz = dest[2] - managerVisualPosRef.current.z;
    const dist = Math.hypot(dx, dz);

    let desiredYaw = yawRef.current;
    if (dist > 0.06) {
      const moveDist = Math.min(dist, 2.05 * dt);
      managerVisualPosRef.current.x += (dx / dist) * moveDist;
      managerVisualPosRef.current.z += (dz / dist) * moveDist;
      desiredYaw = Math.atan2(dx, dz);
    } else if (managerPatrol.phase === 'inspecting') {
      const lx = managerPatrol.targetLookAt[0] - managerVisualPosRef.current.x;
      const lz = managerPatrol.targetLookAt[2] - managerVisualPosRef.current.z;
      if (Math.hypot(lx, lz) > 0.05) {
        desiredYaw = Math.atan2(lx, lz);
      }
    }

    const diffYaw = ((desiredYaw - yawRef.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    yawRef.current += diffYaw * (1 - Math.exp(-10 * dt));

    if (actorRef.current) {
      actorRef.current.position.set(
        managerVisualPosRef.current.x,
        0,
        managerVisualPosRef.current.z,
      );
      actorRef.current.rotation.y = yawRef.current;
    }
  });

  if (!isAway) return null;

  return (
    <group
      ref={actorRef}
      position={managerPatrol.currentPos}
      rotation={[0, managerPatrol.currentYaw, 0]}
    >
      {/* Grounding Contact Shadow */}
      <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 28]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <mesh
        position={[0, 0.95, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          onSelect('manager');
        }}
      >
        <boxGeometry args={[0.7, 1.9, 0.7]} />
        <meshBasicMaterial />
      </mesh>
      <AvatarMesh
        appearance={manager.appearance}
        status={manager.status}
        seedOffset={0}
        pose="standing"
        isWalking={isWalking}
        scale={1.04}
      />
    </group>
  );
};

const OfficeWorld: React.FC<{
  employees: EmployeeProfile[];
  managerPatrol: ManagerPatrolState;
  managerVisualPosRef: React.MutableRefObject<THREE.Vector3>;
  selectedEmployeeId: AgentId | null;
  moveSeatAgentId: AgentId | null;
  onSelectEmployee: (id: AgentId) => void;
  onPlaceSeat: (agentId: AgentId, position: [number, number, number]) => void;
}> = ({
  employees,
  managerPatrol,
  managerVisualPosRef,
  selectedEmployeeId,
  moveSeatAgentId,
  onSelectEmployee,
  onPlaceSeat,
}) => {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);
  const shadowTexture = useContactShadowTexture();
  const manager = employees.find((e) => e.id === 'manager');
  const managerAway = managerPatrol.phase !== 'at_desk';

  return (
    <>
      <OfficeEnvironmentShell
        maxAnisotropy={maxAnisotropy}
        shadowTexture={shadowTexture}
      />
      {employees.map((emp, idx) => (
        <WorkstationPod
          key={emp.id}
          employee={emp}
          seedOffset={idx}
          selected={selectedEmployeeId === emp.id}
          hideAvatar={emp.id === 'manager' && managerAway}
          isMovingSeat={moveSeatAgentId === emp.id}
          disableSelect={moveSeatAgentId !== null}
          onSelect={onSelectEmployee}
          shadowTexture={shadowTexture}
        />
      ))}
      {manager && (
        <WalkingManagerActor
          manager={manager}
          managerPatrol={managerPatrol}
          managerVisualPosRef={managerVisualPosRef}
          selected={selectedEmployeeId === 'manager'}
          onSelect={onSelectEmployee}
          shadowTexture={shadowTexture}
        />
      )}
      {moveSeatAgentId && (
        <SeatPlacementOverlay
          movingAgentId={moveSeatAgentId}
          employees={employees}
          onPlaceSeat={onPlaceSeat}
        />
      )}
    </>
  );
};

export const OfficeScene: React.FC<OfficeSceneProps> = ({
  employees,
  managerPatrol,
  selectedEmployeeId,
  moveSeatAgentId,
  cameraPreset,
  presetVersion,
  onSelectEmployee,
  onPlaceSeat,
  onProjectedLabels,
}) => {
  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);
  const managerVisualPosRef = useRef(new THREE.Vector3(0, 0, -4.45));

  return (
    <div className="relative h-full w-full" data-testid="office-3d-viewport">
      <Canvas
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        camera={{
          fov: 34,
          near: 0.2,
          far: 120,
          position: CAMERA_PRESETS.isometric.pos,
        }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
      >
        <color attach="background" args={['#0b1120']} />
        <fog attach="fog" args={['#0b1120', 24, 52]} />

        <RoomEnvironmentSetup />
        <SoftwareGlPacer active={isSoftwareGl} />

        {/* Warm Key Light + Cool Hemisphere Fill + Subtle Rim */}
        <hemisphereLight args={['#dbeafe', '#475569', 0.85]} />
        <directionalLight
          color="#fff4e0"
          intensity={1.9}
          position={[11, 16, 10]}
          castShadow={!isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={42}
          shadow-camera-left={-11}
          shadow-camera-right={11}
          shadow-camera-top={11}
          shadow-camera-bottom={-11}
          shadow-bias={-0.0005}
          shadow-normalBias={0.02}
        />
        <directionalLight
          color="#93c5fd"
          intensity={0.55}
          position={[-10, 8, -10]}
        />

        <OfficeWorld
          employees={employees}
          managerPatrol={managerPatrol}
          managerVisualPosRef={managerVisualPosRef}
          selectedEmployeeId={selectedEmployeeId}
          moveSeatAgentId={moveSeatAgentId}
          onSelectEmployee={onSelectEmployee}
          onPlaceSeat={onPlaceSeat}
        />

        <SceneRig
          employees={employees}
          managerPatrol={managerPatrol}
          managerVisualPosRef={managerVisualPosRef}
          cameraPreset={cameraPreset}
          presetVersion={presetVersion}
          isSoftwareGl={isSoftwareGl}
          onProjectedLabels={onProjectedLabels}
        />
      </Canvas>
    </div>
  );
};
