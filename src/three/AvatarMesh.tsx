import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentStatus, AvatarAppearance } from '../office/types';

interface AvatarMeshProps {
  appearance: AvatarAppearance;
  status: AgentStatus;
  seedOffset: number;
  pose?: 'seated' | 'standing';
  isWalking?: boolean;
  scale?: number;
}

export const AvatarMesh: React.FC<AvatarMeshProps> = ({
  appearance,
  status,
  seedOffset,
  pose = 'seated',
  isWalking = false,
  scale = 1,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const upperBodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const thinkingRingRef = useRef<THREE.Mesh>(null);
  const statusOrbRef = useRef<THREE.Mesh>(null);

  const isStanding = pose === 'standing';
  const indicatorBaseY = isStanding ? 1.98 : 1.68;

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    const t = state.clock.elapsedTime + seedOffset * 1.7;
    const root = rootRef.current;
    const upper = upperBodyRef.current;
    const head = headRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    if (!root || !upper || !head || !leftArm || !rightArm) return;

    let targetTorsoX = 0.06;
    let targetTorsoY = 0;
    let targetHeadX = 0.05;
    let targetHeadY = 0;
    let targetHeadZ = 0;
    let targetLeftArmX = -0.85;
    let targetLeftArmZ = 0.1;
    let targetRightArmX = -0.85;
    let targetRightArmZ = -0.1;
    let targetLeftLegX = 0;
    let targetRightLegX = 0;
    let targetRootY = 0;

    if (isStanding) {
      if (isWalking) {
        const stride = Math.sin(t * 7.8);
        targetRootY = Math.abs(Math.sin(t * 7.8)) * 0.032;
        targetTorsoX = 0.07;
        targetTorsoY = stride * 0.05;
        targetHeadX = 0.02;
        targetHeadY = Math.sin(t * 1.9) * 0.08;
        targetLeftLegX = stride * 0.56;
        targetRightLegX = -stride * 0.56;
        // Manager carries tablet in left hand while swinging right arm naturally
        targetLeftArmX = appearance.accessory === 'tablet' ? -0.58 - stride * 0.16 : -stride * 0.45 - 0.1;
        targetLeftArmZ = 0.12;
        targetRightArmX = stride * 0.48 - 0.08;
        targetRightArmZ = -0.1;
      } else {
        // Standing beside colleague's desk monitoring work
        targetRootY = 0;
        targetTorsoX = 0.04 + Math.sin(t * 1.5) * 0.02;
        targetTorsoY = Math.sin(t * 0.9) * 0.05;
        targetHeadX = 0.08 + Math.sin(t * 2.1) * 0.05;
        targetHeadY = Math.sin(t * 1.1) * 0.16;
        targetLeftArmX = appearance.accessory === 'tablet' ? -0.92 : -0.32;
        targetLeftArmZ = 0.15;
        targetRightArmX = -0.58 + Math.sin(t * 2.4) * 0.09;
        targetRightArmZ = 0.16;
      }
    } else if (status === 'Working') {
      // Focused typing kinematics
      targetTorsoX = 0.14 + Math.sin(t * 2.5) * 0.02;
      targetHeadX = 0.12 + Math.sin(t * 3.0) * 0.03;
      targetHeadY = Math.sin(t * 1.2) * 0.12;
      targetLeftArmX = -0.95 + Math.sin(t * 14.0) * 0.14;
      targetRightArmX = -0.95 + Math.cos(t * 14.0) * 0.14;
    } else if (status === 'Thinking') {
      // Leans back slightly, right hand raised toward chin
      targetTorsoX = -0.05 + Math.sin(t * 1.1) * 0.02;
      targetHeadX = -0.08 + Math.sin(t * 0.9) * 0.04;
      targetHeadY = Math.sin(t * 0.65) * 0.18;
      targetHeadZ = 0.09;
      targetLeftArmX = -0.45;
      targetRightArmX = -1.75 + Math.sin(t * 1.8) * 0.05;
      targetRightArmZ = 0.28;
    } else if (status === 'Idle') {
      // Relaxed breathing & gentle ambient look
      targetTorsoX = Math.sin(t * 1.4) * 0.025;
      targetTorsoY = Math.sin(t * 0.6) * 0.03;
      targetHeadY = Math.sin(t * 0.5) * 0.24;
      targetLeftArmX = -0.42 + Math.sin(t * 1.2) * 0.03;
      targetRightArmX = -0.42 - Math.sin(t * 1.2) * 0.03;
    } else if (status === 'Completed') {
      // Upbeat celebratory wave
      targetTorsoX = -0.04;
      targetTorsoY = Math.sin(t * 3.2) * 0.04;
      targetHeadX = -0.06;
      targetHeadY = Math.sin(t * 2.5) * 0.12;
      targetLeftArmX = -0.5;
      targetRightArmX = -2.25;
      targetRightArmZ = -0.35 + Math.sin(t * 7.5) * 0.28;
    } else if (status === 'Error') {
      // Alert posture with subtle head shake
      targetTorsoX = -0.14;
      targetHeadY = Math.sin(t * 8.5) * 0.16;
      targetHeadX = -0.05;
      targetLeftArmX = -1.45;
      targetLeftArmZ = 0.42;
      targetRightArmX = -1.45;
      targetRightArmZ = -0.42;
    }

    const dampFactor = isWalking ? 12 : 8;
    root.position.y = THREE.MathUtils.damp(root.position.y, targetRootY, dampFactor, dt);
    upper.rotation.x = THREE.MathUtils.damp(upper.rotation.x, targetTorsoX, dampFactor, dt);
    upper.rotation.y = THREE.MathUtils.damp(upper.rotation.y, targetTorsoY, dampFactor, dt);
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x, targetHeadX, dampFactor, dt);
    head.rotation.y = THREE.MathUtils.damp(head.rotation.y, targetHeadY, dampFactor, dt);
    head.rotation.z = THREE.MathUtils.damp(head.rotation.z, targetHeadZ, dampFactor, dt);

    leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, targetLeftArmX, dampFactor, dt);
    leftArm.rotation.z = THREE.MathUtils.damp(leftArm.rotation.z, targetLeftArmZ, dampFactor, dt);
    rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, targetRightArmX, dampFactor, dt);
    rightArm.rotation.z = THREE.MathUtils.damp(rightArm.rotation.z, targetRightArmZ, dampFactor, dt);

    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = THREE.MathUtils.damp(
        leftLegRef.current.rotation.x,
        targetLeftLegX,
        dampFactor,
        dt,
      );
      rightLegRef.current.rotation.x = THREE.MathUtils.damp(
        rightLegRef.current.rotation.x,
        targetRightLegX,
        dampFactor,
        dt,
      );
    }

    if (thinkingRingRef.current) {
      thinkingRingRef.current.rotation.z += dt * 1.4;
      thinkingRingRef.current.position.y = indicatorBaseY + Math.sin(t * 2.2) * 0.04;
    }
    if (statusOrbRef.current) {
      statusOrbRef.current.position.y = indicatorBaseY + Math.sin(t * 2.6) * 0.03;
    }
  });

  const statusColor =
    status === 'Working'
      ? '#3b82f6'
      : status === 'Thinking'
        ? '#f59e0b'
        : status === 'Completed'
          ? '#10b981'
          : status === 'Error'
            ? '#ef4444'
            : '#64748b';

  return (
    <group ref={rootRef} position={[0, 0, 0]} scale={scale}>
      {isStanding ? (
        <>
          {/* Standing Pelvis */}
          <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.14, 0.24]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} metalness={0.05} />
          </mesh>
          {/* Left Articulated Leg */}
          <group ref={leftLegRef} position={[-0.1, 0.78, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <boxGeometry args={[0.13, 0.38, 0.14]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.54, 0]} castShadow>
              <boxGeometry args={[0.11, 0.36, 0.12]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.74, 0.04]} castShadow>
              <boxGeometry args={[0.12, 0.08, 0.2]} />
              <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.1} />
            </mesh>
          </group>
          {/* Right Articulated Leg */}
          <group ref={rightLegRef} position={[0.1, 0.78, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <boxGeometry args={[0.13, 0.38, 0.14]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.54, 0]} castShadow>
              <boxGeometry args={[0.11, 0.36, 0.12]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.74, 0.04]} castShadow>
              <boxGeometry args={[0.12, 0.08, 0.2]} />
              <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.1} />
            </mesh>
          </group>
        </>
      ) : (
        <>
          {/* Seated Pelvis & Legs */}
          <mesh position={[0, 0.5, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.14, 0.28]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} metalness={0.05} />
          </mesh>
          {/* Left & Right Thighs */}
          <mesh position={[-0.1, 0.48, 0.2]} castShadow>
            <boxGeometry args={[0.13, 0.12, 0.34]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
          </mesh>
          <mesh position={[0.1, 0.48, 0.2]} castShadow>
            <boxGeometry args={[0.13, 0.12, 0.34]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
          </mesh>
          {/* Shins */}
          <mesh position={[-0.1, 0.26, 0.34]} castShadow>
            <boxGeometry args={[0.11, 0.36, 0.11]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
          </mesh>
          <mesh position={[0.1, 0.26, 0.34]} castShadow>
            <boxGeometry args={[0.11, 0.36, 0.11]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
          </mesh>
          {/* Shoes */}
          <mesh position={[-0.1, 0.05, 0.39]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.1} />
          </mesh>
          <mesh position={[0.1, 0.05, 0.39]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.1} />
          </mesh>
        </>
      )}

      {/* Articulated Upper Body */}
      <group ref={upperBodyRef} position={[0, isStanding ? 0.85 : 0.56, isStanding ? 0 : 0.02]}>
        {/* Torso / Jacket */}
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.46, 0.24]} />
          <meshStandardMaterial color={appearance.jacketColor} roughness={0.65} metalness={0.05} />
        </mesh>
        {/* Inner Shirt V-panel */}
        <mesh position={[0, 0.29, 0.115]} castShadow>
          <boxGeometry args={[0.14, 0.34, 0.03]} />
          <meshStandardMaterial color={appearance.shirtColor} roughness={0.75} />
        </mesh>
        {/* Collar / Neck */}
        <mesh position={[0, 0.52, 0]} castShadow>
          <cylinderGeometry args={[0.065, 0.075, 0.1, 12]} />
          <meshStandardMaterial color={appearance.skinColor} roughness={0.6} />
        </mesh>

        {/* Role Accent Pin / Badge */}
        <mesh position={[0.11, 0.35, 0.13]}>
          <boxGeometry args={[0.06, 0.035, 0.015]} />
          <meshStandardMaterial color={appearance.accentColor} roughness={0.25} metalness={0.5} />
        </mesh>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.25, 0.42, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[0.11, 0.3, 0.11]} />
            <meshStandardMaterial color={appearance.jacketColor} roughness={0.65} />
          </mesh>
          {/* Left Hand */}
          <mesh position={[0, -0.31, 0]} castShadow>
            <sphereGeometry args={[0.055, 10, 10]} />
            <meshStandardMaterial color={appearance.skinColor} roughness={0.55} />
          </mesh>
          {appearance.accessory === 'tablet' && (
            <mesh position={[0.03, -0.32, 0.09]} rotation={[0.4, 0, 0]}>
              <boxGeometry args={[0.16, 0.2, 0.015]} />
              <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.7} />
            </mesh>
          )}
        </group>

        {/* Right Arm */}
        <group ref={rightArmRef} position={[0.25, 0.42, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <boxGeometry args={[0.11, 0.3, 0.11]} />
            <meshStandardMaterial color={appearance.jacketColor} roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.31, 0]} castShadow>
            <sphereGeometry args={[0.055, 10, 10]} />
            <meshStandardMaterial color={appearance.skinColor} roughness={0.55} />
          </mesh>
          {appearance.accessory === 'stylus' && (
            <mesh position={[0, -0.33, 0.07]} rotation={[Math.PI / 3, 0, 0]}>
              <cylinderGeometry args={[0.01, 0.008, 0.16, 8]} />
              <meshStandardMaterial color="#f43f5e" roughness={0.2} metalness={0.6} />
            </mesh>
          )}
          {appearance.accessory === 'watch' && (
            <mesh position={[0, -0.25, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.035, 12]} />
              <meshStandardMaterial color="#10b981" roughness={0.25} metalness={0.8} />
            </mesh>
          )}
        </group>

        {/* Head Group */}
        <group ref={headRef} position={[0, 0.64, 0]}>
          {/* Head */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.25, 0.27, 0.25]} />
            <meshStandardMaterial color={appearance.skinColor} roughness={0.58} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.055, 0.02, 0.128]}>
            <boxGeometry args={[0.032, 0.032, 0.015]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} />
          </mesh>
          <mesh position={[0.055, 0.02, 0.128]}>
            <boxGeometry args={[0.032, 0.032, 0.015]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} />
          </mesh>

          {/* Hair Variations */}
          <mesh position={[0, 0.145, -0.01]} castShadow>
            <boxGeometry args={[0.27, 0.08, 0.27]} />
            <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.04, -0.12]} castShadow>
            <boxGeometry args={[0.26, 0.22, 0.06]} />
            <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
          </mesh>
          {appearance.hairStyle === 'bun' && (
            <mesh position={[0, 0.21, -0.1]} castShadow>
              <sphereGeometry args={[0.085, 12, 12]} />
              <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
            </mesh>
          )}
          {appearance.hairStyle === 'waves' && (
            <>
              <mesh position={[-0.135, -0.02, -0.02]} castShadow>
                <boxGeometry args={[0.05, 0.22, 0.18]} />
                <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[0.135, -0.02, -0.02]} castShadow>
                <boxGeometry args={[0.05, 0.22, 0.18]} />
                <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
              </mesh>
            </>
          )}
          {appearance.hairStyle === 'curly' && (
            <mesh position={[0, 0.19, 0.01]} castShadow>
              <sphereGeometry args={[0.145, 12, 10]} />
              <meshStandardMaterial color={appearance.hairColor} roughness={0.9} />
            </mesh>
          )}

          {/* Accessories: Glasses */}
          {appearance.accessory === 'glasses' && (
            <group position={[0, 0.02, 0.138]}>
              <mesh position={[-0.058, 0, 0]}>
                <torusGeometry args={[0.036, 0.007, 8, 16]} />
                <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
              </mesh>
              <mesh position={[0.058, 0, 0]}>
                <torusGeometry args={[0.036, 0.007, 8, 16]} />
                <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
              </mesh>
              <mesh position={[0, 0.004, 0]}>
                <boxGeometry args={[0.04, 0.008, 0.008]} />
                <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
              </mesh>
            </group>
          )}

          {/* Accessories: Studio Headphones (Video Editor) */}
          {appearance.accessory === 'headphones' && (
            <group>
              <mesh position={[-0.145, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.055, 0.04, 14]} />
                <meshStandardMaterial color="#4338ca" roughness={0.25} metalness={0.6} />
              </mesh>
              <mesh position={[0.145, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.055, 0.04, 14]} />
                <meshStandardMaterial color="#4338ca" roughness={0.25} metalness={0.6} />
              </mesh>
              <mesh position={[0, 0.16, 0]}>
                <torusGeometry args={[0.15, 0.016, 8, 20, Math.PI]} />
                <meshStandardMaterial color="#1e1b4b" roughness={0.35} metalness={0.5} />
              </mesh>
            </group>
          )}

          {/* Accessories: Sleek Mic Headset (Scriptwriter) */}
          {appearance.accessory === 'headset' && (
            <group>
              <mesh position={[0.14, 0, 0]}>
                <boxGeometry args={[0.03, 0.08, 0.06]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.7} />
              </mesh>
              <mesh position={[0.1, -0.05, 0.09]} rotation={[0, 0.5, 0]}>
                <boxGeometry args={[0.12, 0.014, 0.014]} />
                <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
              </mesh>
            </group>
          )}
        </group>
      </group>

      {/* Status-driven subtle overhead 3D indicator */}
      {status === 'Thinking' && (
        <mesh ref={thinkingRingRef} position={[0, 1.68, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.14, 0.018, 8, 24, Math.PI * 1.4]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={0.65}
            roughness={0.3}
          />
        </mesh>
      )}
      {(status === 'Completed' || status === 'Error') && (
        <mesh ref={statusOrbRef} position={[0, 1.68, 0]}>
          <octahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={0.7}
            roughness={0.25}
            metalness={0.3}
          />
        </mesh>
      )}
    </group>
  );
};
