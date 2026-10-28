import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { InputController } from './input';

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

interface EchoReplacement {
  start: THREE.Vector3;
  target: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export class PlayerController {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly characterController: RAPIER.KinematicCharacterController;
  private readonly velocity = new THREE.Vector3();
  private readonly wishDirection = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = false;
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private bobTime = 0;
  private cameraBob = 0;
  private adsAmount = 0;
  private echoReplacement: EchoReplacement | null = null;
  private echoReplacementCompleted = false;
  private readonly spawnPosition: THREE.Vector3;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    physicsWorld: RAPIER.World,
    private readonly input: InputController,
    spawnPosition = new THREE.Vector3(0, 1.05, 14),
  ) {
    const config = GAME_CONFIG.player;
    this.spawnPosition = spawnPosition.clone();
    this.body = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.spawnPosition.x,
        this.spawnPosition.y,
        this.spawnPosition.z,
      ),
    );
    this.collider = physicsWorld.createCollider(
      RAPIER.ColliderDesc.capsule(config.halfHeight, config.radius)
        .setFriction(0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );

    this.characterController = physicsWorld.createCharacterController(0.025);
    this.characterController.enableAutostep(0.42, 0.22, true);
    this.characterController.enableSnapToGround(0.28);
    this.characterController.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.characterController.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    this.characterController.setApplyImpulsesToDynamicBodies(true);

    this.camera.rotation.order = 'YXZ';
    this.syncCamera(0);
  }

  get isReplacingEcho(): boolean {
    return this.echoReplacement !== null;
  }

  update(deltaSeconds: number, adsAmount: number): void {
    const config = GAME_CONFIG.player;
    this.adsAmount = adsAmount;
    if (this.echoReplacement) {
      this.input.consumeMouseDelta();
      this.updateEchoReplacement(deltaSeconds);
      return;
    }
    this.updateLook(deltaSeconds);

    this.jumpBuffer = Math.max(0, this.jumpBuffer - deltaSeconds);
    this.coyoteTimer = this.grounded ? 0.11 : Math.max(0, this.coyoteTimer - deltaSeconds);
    if (this.input.wasPressed('Space')) this.jumpBuffer = 0.12;

    const inputX = Number(this.input.isDown('KeyD')) - Number(this.input.isDown('KeyA'));
    const inputZ = Number(this.input.isDown('KeyW')) - Number(this.input.isDown('KeyS'));
    const hasMoveInput = inputX !== 0 || inputZ !== 0;
    const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const maxSpeed = sprinting ? config.sprintSpeed : config.walkSpeed;

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.wishDirection.set(
      forwardX * inputZ + rightX * inputX,
      0,
      forwardZ * inputZ + rightZ * inputX,
    );
    if (this.wishDirection.lengthSq() > 1) this.wishDirection.normalize();

    if (this.grounded) {
      const targetX = hasMoveInput ? this.wishDirection.x * maxSpeed : 0;
      const targetZ = hasMoveInput ? this.wishDirection.z * maxSpeed : 0;
      const acceleration = hasMoveInput ? config.groundAcceleration : config.groundFriction;
      this.velocity.x = moveToward(this.velocity.x, targetX, acceleration * deltaSeconds);
      this.velocity.z = moveToward(this.velocity.z, targetZ, acceleration * deltaSeconds);
      if (this.velocity.y < 0) this.velocity.y = -1;
    } else if (hasMoveInput) {
      const currentAlongWish =
        this.velocity.x * this.wishDirection.x + this.velocity.z * this.wishDirection.z;
      const speedToAdd = maxSpeed - currentAlongWish;
      if (speedToAdd > 0) {
        const acceleration = Math.min(
          speedToAdd,
          config.airAcceleration * config.airControl * deltaSeconds,
        );
        this.velocity.x += this.wishDirection.x * acceleration;
        this.velocity.z += this.wishDirection.z * acceleration;
      }
      const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      const airSpeedLimit = config.sprintSpeed * 1.08;
      if (horizontalSpeed > airSpeedLimit) {
        const scale = airSpeedLimit / horizontalSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = config.jumpSpeed;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
    } else {
      this.velocity.y -= config.gravity * deltaSeconds;
    }

    const desiredMovement = {
      x: this.velocity.x * deltaSeconds,
      y: this.velocity.y * deltaSeconds,
      z: this.velocity.z * deltaSeconds,
    };
    this.characterController.computeColliderMovement(this.collider, desiredMovement);
    const corrected = this.characterController.computedMovement();
    const current = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: current.x + corrected.x,
      y: current.y + corrected.y,
      z: current.z + corrected.z,
    });

    const wasGrounded = this.grounded;
    this.grounded = this.characterController.computedGrounded();
    if (this.grounded && !wasGrounded && this.velocity.y < -4) {
      this.cameraBob = Math.min(0.08, Math.abs(this.velocity.y) * 0.005);
    }
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1;

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && planarSpeed > 0.5) {
      this.bobTime += deltaSeconds * GAME_CONFIG.camera.bobFrequency * (planarSpeed / config.walkSpeed);
    }

    if (current.y < -8) this.respawn();
  }

  syncCamera(deltaSeconds: number): void {
    const position = this.body.translation();
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moveBob =
      this.grounded && planarSpeed > 0.5
        ? Math.sin(this.bobTime * 2) * GAME_CONFIG.camera.bobAmount * Math.min(1, planarSpeed / 7)
        : 0;
    this.cameraBob = moveToward(this.cameraBob, 0, deltaSeconds * 0.35);
    this.camera.position.set(
      position.x,
      position.y + GAME_CONFIG.player.eyeOffset + moveBob - this.cameraBob,
      position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  addRecoil(pitch: number, yaw: number): void {
    // Gameplay recoil changes the true aim angle. It intentionally does not auto-return,
    // so pulling the mouse down is the only way to counter sustained vertical climb.
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + pitch,
      -GAME_CONFIG.player.maxPitch,
      GAME_CONFIG.player.maxPitch,
    );
    this.yaw += yaw;
  }

  isEnemyAggroActive(): boolean {
    return true;
  }

  getEnemyAggroPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.getBodyPosition(target);
  }

  getBodyPosition(target: THREE.Vector3): THREE.Vector3 {
    const position = this.body.translation();
    return target.set(position.x, position.y, position.z);
  }

  getAimQuaternion(target: THREE.Quaternion): THREE.Quaternion {
    return this.camera.getWorldQuaternion(target);
  }

  getViewPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldPosition(target);
  }

  getViewDirection(target: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldDirection(target);
  }

  beginEchoReplacement(target: THREE.Vector3): boolean {
    if (this.echoReplacement) return false;

    const start = this.getBodyPosition(new THREE.Vector3());
    const distance = start.distanceTo(target);
    const echoConfig = GAME_CONFIG.echo;
    this.echoReplacement = {
      start,
      target: target.clone(),
      elapsed: 0,
      duration: THREE.MathUtils.clamp(
        distance / echoConfig.takeoverSpeed,
        echoConfig.takeoverMinSeconds,
        echoConfig.takeoverMaxSeconds,
      ),
    };
    this.echoReplacementCompleted = false;
    this.velocity.set(0, 0, 0);
    this.jumpBuffer = 0;
    this.coyoteTimer = 0;
    this.cameraBob = 0;
    return true;
  }

  consumeEchoReplacementCompleted(): boolean {
    const completed = this.echoReplacementCompleted;
    this.echoReplacementCompleted = false;
    return completed;
  }

  private updateEchoReplacement(deltaSeconds: number): void {
    const replacement = this.echoReplacement;
    if (!replacement) return;

    replacement.elapsed = Math.min(replacement.duration, replacement.elapsed + deltaSeconds);
    const progress = replacement.elapsed / replacement.duration;
    const position = replacement.start.clone().lerp(replacement.target, progress);
    this.body.setNextKinematicTranslation(position);

    if (progress >= 1) {
      this.echoReplacement = null;
      this.echoReplacementCompleted = true;
      this.grounded = false;
    }
  }

  private updateLook(_deltaSeconds: number): void {
    const delta = this.input.consumeMouseDelta();
    const sensitivity =
      GAME_CONFIG.player.mouseSensitivity *
      (1 - this.adsAmount * (1 - GAME_CONFIG.player.adsSensitivityMultiplier));
    this.yaw -= delta.x * sensitivity;
    this.pitch -= delta.y * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -GAME_CONFIG.player.maxPitch,
      GAME_CONFIG.player.maxPitch,
    );
  }

  private respawn(): void {
    const position = {
      x: this.spawnPosition.x,
      y: this.spawnPosition.y,
      z: this.spawnPosition.z,
    };
    this.body.setTranslation(position, true);
    this.body.setNextKinematicTranslation(position);
    this.velocity.set(0, 0, 0);
  }
}
