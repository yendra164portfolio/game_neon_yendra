import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AgentId, CameraPresetId, EmployeeProfile } from '../office/types';
import {
  OfficeEnvironmentShell,
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
  selectedEmployeeId: AgentId | null;
  cameraPreset: CameraPresetId;
  presetVersion: number;
  onSelectEmployee: (id: AgentId) => void;
  onProjectedLabels: (tags: ProjectedEmployeeTag[]) => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  isometric: { pos: [14.5, 12.2, 14.5], target: [0.0, 0.7, -0.2] },
  manager: { pos: [-1.4, 5.2, 1.5], target: [-4.8, 0.9, -3.5] },
  video_bay: { pos: [3.2, 5.0, 6.4], target: [0.2, 0.9, 2.0] },
  creative_pod: { pos: [9.2, 5.8, 6.2], target: [4.5, 0.9, 2.8] },
  meeting_room: { pos: [9.4, 6.5, 1.8], target: [5.0, 1.0, -3.5] },
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
  cameraPreset: CameraPresetId;
  presetVersion: number;
  isSoftwareGl: boolean;
  onProjectedLabels: (tags: ProjectedEmployeeTag[]) => void;
}> = ({
  employees,
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
        // Anchor just above avatar's head at workstation chair offset
        const rot = emp.deskRotationY;
        const worldX = emp.deskPosition[0] + Math.sin(rot) * 0.45;
        const worldZ = emp.deskPosition[2] + Math.cos(rot) * 0.45;
        _projVec.set(worldX, 2.02, worldZ);
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

const OfficeWorld: React.FC<{
  employees: EmployeeProfile[];
  selectedEmployeeId: AgentId | null;
  onSelectEmployee: (id: AgentId) => void;
}> = ({ employees, selectedEmployeeId, onSelectEmployee }) => {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);
  const shadowTexture = useContactShadowTexture();

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
          onSelect={onSelectEmployee}
          shadowTexture={shadowTexture}
        />
      ))}
    </>
  );
};

export const OfficeScene: React.FC<OfficeSceneProps> = ({
  employees,
  selectedEmployeeId,
  cameraPreset,
  presetVersion,
  onSelectEmployee,
  onProjectedLabels,
}) => {
  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);

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
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={onSelectEmployee}
        />

        <SceneRig
          employees={employees}
          cameraPreset={cameraPreset}
          presetVersion={presetVersion}
          isSoftwareGl={isSoftwareGl}
          onProjectedLabels={onProjectedLabels}
        />
      </Canvas>
    </div>
  );
};
