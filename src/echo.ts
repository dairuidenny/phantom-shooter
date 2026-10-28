import * as THREE from 'three';
import { GameAudio } from './audio';
import { GAME_CONFIG } from './config';
import { InputController } from './input';
import { PlayerController } from './player';
import type { WeaponEventSink } from './weapon';
import { TrainingWorld } from './world';

const MAX_RECORDING_SECONDS = 4;
const MIN_RECORDING_SECONDS = 0.5;
const ECHO_SLOT_COUNT = 3;
const ECHO_BLUE = 0x39b9ff;
const ECHO_ORANGE = 0xff8a24;
const ECHO_ORANGE_EMISSIVE = 0xd94d00;

interface EchoFrame {
  time: number;
  position: THREE.Vector3;
  aim: THREE.Quaternion;
  ads: number;
}

interface ShotAction {
  type: 'shot';
  time: number;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

interface ReloadAction {
  type: 'reload';
  time: number;
}

type EchoAction = ShotAction | ReloadAction;

interface EchoRecording {
  duration: number;
  frames: EchoFrame[];
  actions: EchoAction[];
}

interface EchoMaterialState {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

type EchoMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};

export class EchoSystem implements WeaponEventSink {
  private readonly slots: Array<EchoPlayback | null> = Array.from(
    { length: ECHO_SLOT_COUNT },
    () => null,
  );
  private readonly raycaster = new THREE.Raycaster();
  private frames: EchoFrame[] = [];
  private actions: EchoAction[] = [];
  private recording = false;
  private recordingElapsed = 0;
  private stopRequested = false;
  private nextSlot = 0;
  private targetedSlot: number | null = null;
  private replacingSlot: number | null = null;
  private detonationCharge = 0;

  constructor(
    private readonly input: InputController,
    private readonly player: PlayerController,
    private readonly world: TrainingWorld,
    private readonly audio: GameAudio,
  ) {
    // The default line threshold is one world unit, which makes the echo outline
    // targetable even when the crosshair is visibly beside it.
    this.raycaster.params.Line.threshold = 0.03;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  get isReplacing(): boolean {
    return this.replacingSlot !== null;
  }

  get recordingProgress(): number {
    return this.recording ? this.recordingElapsed / MAX_RECORDING_SECONDS : 0;
  }

  get detonationChargeAmount(): number {
    return this.detonationCharge;
  }

  get detonationChargeProgress(): number {
    return this.detonationCharge / GAME_CONFIG.echo.detonationChargeRequired;
  }

  get isDetonationReady(): boolean {
    return this.detonationCharge >= GAME_CONFIG.echo.detonationChargeRequired;
  }

  get slotStates(): readonly boolean[] {
    return this.slots.map((slot) => slot !== null);
  }

  dispose(): void {
    this.setTargetedSlot(null);
    for (let index = 0; index < this.slots.length; index += 1) {
      this.slots[index]?.dispose();
      this.slots[index] = null;
    }
  }

  update(deltaSeconds: number, active: boolean, adsAmount: number): void {
    if (
      this.replacingSlot !== null &&
      this.player.consumeEchoReplacementCompleted()
    ) {
      this.completeReplacement();
    }

    if (!active) {
      if (this.replacingSlot === null) this.setTargetedSlot(null);
      return;
    }

    for (const playback of this.slots) playback?.update(deltaSeconds);
    if (this.replacingSlot !== null) return;

    const wasRecordingAtFrameStart = this.recording;
    if (this.input.wasPressed('KeyE')) {
      if (this.recording) {
        if (this.recordingElapsed >= MIN_RECORDING_SECONDS) {
          this.finishRecording();
        } else {
          this.stopRequested = true;
        }
      } else {
        this.startRecording(adsAmount);
      }
    }

    // Detonation is deliberately disabled for the entire frame if recording was active.
    if (
      !wasRecordingAtFrameStart &&
      !this.recording &&
      this.isDetonationReady &&
      this.input.wasPressed('KeyQ')
    ) {
      if (this.detonateAll() > 0) this.detonationCharge = 0;
    }

    if (this.recording) {
      this.recordingElapsed = Math.min(
        MAX_RECORDING_SECONDS,
        this.recordingElapsed + deltaSeconds,
      );
      this.captureFrame(this.recordingElapsed, adsAmount);

      if (
        this.recordingElapsed >= MAX_RECORDING_SECONDS ||
        (this.stopRequested && this.recordingElapsed >= MIN_RECORDING_SECONDS)
      ) {
        this.finishRecording();
      }
    }

    if (this.recording) {
      this.setTargetedSlot(null);
      return;
    }

    this.updateTargeting();
    if (this.targetedSlot !== null && this.input.wasPressed('KeyF')) {
      this.beginReplacement(this.targetedSlot);
    }
  }

  recordShot(origin: THREE.Vector3, direction: THREE.Vector3): void {
    if (!this.recording) return;
    this.actions.push({
      type: 'shot',
      time: this.recordingElapsed,
      origin: origin.clone(),
      direction: direction.clone(),
    });
  }

  registerHit(): void {
    this.detonationCharge = Math.min(
      GAME_CONFIG.echo.detonationChargeRequired,
      this.detonationCharge + 1,
    );
  }

  recordReload(): void {
    if (!this.recording) return;
    this.actions.push({ type: 'reload', time: this.recordingElapsed });
  }

  private updateTargeting(): void {
    const origin = this.player.getViewPosition(new THREE.Vector3());
    const direction = this.player.getViewDirection(new THREE.Vector3());
    const range = GAME_CONFIG.echo.takeoverRange;
    const obstructionDistance = this.world.getRayHitDistance(origin, direction, range);
    this.raycaster.set(origin, direction);
    this.raycaster.far = range;

    let nearestSlot: number | null = null;
    let nearestDistance = obstructionDistance + 0.001;
    for (let index = 0; index < this.slots.length; index += 1) {
      const playback = this.slots[index];
      if (!playback) continue;
      const intersection = this.raycaster.intersectObject(playback.object, true)[0];
      if (!intersection || intersection.distance >= nearestDistance) continue;
      nearestSlot = index;
      nearestDistance = intersection.distance;
    }
    this.setTargetedSlot(nearestSlot);
  }

  private setTargetedSlot(slotIndex: number | null): void {
    if (slotIndex === this.targetedSlot) return;
    if (this.targetedSlot !== null) {
      this.slots[this.targetedSlot]?.setTargeted(false);
    }
    this.targetedSlot = slotIndex;
    if (slotIndex !== null) this.slots[slotIndex]?.setTargeted(true);
  }

  private beginReplacement(slotIndex: number): void {
    const playback = this.slots[slotIndex];
    if (!playback) return;

    const target = playback.getPosition(new THREE.Vector3());
    if (!this.player.beginEchoReplacement(target)) return;
    playback.setFrozen(true);
    this.replacingSlot = slotIndex;
  }

  private completeReplacement(): void {
    if (this.replacingSlot === null) return;
    const playback = this.slots[this.replacingSlot];
    playback?.setTargeted(false);
    playback?.dispose();
    this.slots[this.replacingSlot] = null;
    this.replacingSlot = null;
    this.targetedSlot = null;
  }

  private startRecording(adsAmount: number): void {
    this.recording = true;
    this.recordingElapsed = 0;
    this.stopRequested = false;
    this.frames = [];
    this.actions = [];
    this.captureFrame(0, adsAmount);
  }

  private finishRecording(): void {
    if (!this.recording) return;
    this.recording = false;
    this.stopRequested = false;

    const duration = Math.max(MIN_RECORDING_SECONDS, this.recordingElapsed);
    if (this.frames.length === 1) {
      const onlyFrame = this.frames[0];
      this.frames.push({
        time: duration,
        position: onlyFrame.position.clone(),
        aim: onlyFrame.aim.clone(),
        ads: onlyFrame.ads,
      });
    }

    const emptySlot = this.slots.findIndex((slot) => slot === null);
    const slotIndex = emptySlot >= 0 ? emptySlot : this.nextSlot;
    this.slots[slotIndex]?.dispose();
    this.slots[slotIndex] = new EchoPlayback(
      {
        duration,
        frames: this.frames,
        actions: this.actions,
      },
      this.world,
      this.audio,
      () => this.registerHit(),
    );
    // Filling the slot currently at the head of the overwrite cycle consumes that
    // turn too; otherwise a freshly refilled oldest slot would be overwritten next.
    if (slotIndex === this.nextSlot) {
      this.nextSlot = (this.nextSlot + 1) % ECHO_SLOT_COUNT;
    }
    this.frames = [];
    this.actions = [];
    this.recordingElapsed = 0;
  }

  private captureFrame(time: number, adsAmount: number): void {
    this.frames.push({
      time,
      position: this.player.getBodyPosition(new THREE.Vector3()),
      aim: this.player.getAimQuaternion(new THREE.Quaternion()),
      ads: adsAmount,
    });
  }

  private detonateAll(): number {
    this.setTargetedSlot(null);
    let explosionIndex = 0;
    for (let index = 0; index < this.slots.length; index += 1) {
      const playback = this.slots[index];
      if (!playback) continue;
      this.world.spawnEchoExplosion(playback.getPosition(new THREE.Vector3()));
      this.audio.echoExplosion(explosionIndex * 0.035);
      playback.dispose();
      this.slots[index] = null;
      explosionIndex += 1;
    }
    if (explosionIndex > 0) this.nextSlot = 0;
    return explosionIndex;
  }
}

class EchoPlayback {
  private readonly root = new THREE.Group();
  private readonly weaponAnchor = new THREE.Group();
  private readonly weaponVisual = new THREE.Group();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly materialStates = new Map<EchoMaterial, EchoMaterialState>();
  private playhead = 0;
  private actionIndex = 0;
  private frameIndex = 0;
  private muzzleFlashTimer = 0;
  private frozen = false;
  private targeted = false;

  constructor(
    private readonly recording: EchoRecording,
    private readonly world: TrainingWorld,
    private readonly audio: GameAudio,
    private readonly onHit: () => void,
  ) {
    const capsuleGeometry = new THREE.CapsuleGeometry(
      GAME_CONFIG.player.radius,
      GAME_CONFIG.player.halfHeight * 2,
      8,
      16,
    );
    const capsuleMaterial = new THREE.MeshStandardMaterial({
      color: ECHO_BLUE,
      emissive: 0x087dc2,
      emissiveIntensity: 1.25,
      transparent: true,
      opacity: 0.3,
      roughness: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
    capsule.renderOrder = 3;
    this.root.add(capsule);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(capsuleGeometry, 18),
      new THREE.LineBasicMaterial({
        color: 0xa8e6ff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    outline.renderOrder = 4;
    this.root.add(outline);

    this.buildWeapon();
    this.weaponAnchor.position.y = GAME_CONFIG.player.eyeOffset;
    this.weaponAnchor.add(this.weaponVisual);
    this.root.add(this.weaponAnchor);

    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xbcecff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), flashMaterial);
    this.muzzleFlash.position.set(0, 0.015, -1.08);
    this.muzzleFlash.visible = false;
    this.weaponVisual.add(this.muzzleFlash);

    this.world.scene.add(this.root);
    this.setPose(0);
  }

  get object(): THREE.Object3D {
    return this.root;
  }

  update(deltaSeconds: number): void {
    if (this.frozen) return;
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - deltaSeconds);
    this.muzzleFlash.visible = this.muzzleFlashTimer > 0;

    const nextTime = this.playhead + deltaSeconds;
    if (nextTime >= this.recording.duration) {
      this.emitActionsUntil(this.recording.duration);
      this.playhead = nextTime % this.recording.duration;
      this.actionIndex = 0;
      this.frameIndex = 0;
      this.emitActionsUntil(this.playhead);
    } else {
      this.playhead = nextTime;
      this.emitActionsUntil(this.playhead);
    }
    this.setPose(this.playhead);
  }

  getPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.root.getWorldPosition(target);
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (frozen) {
      this.muzzleFlashTimer = 0;
      this.muzzleFlash.visible = false;
    }
  }

  setTargeted(targeted: boolean): void {
    if (targeted === this.targeted) return;
    this.targeted = targeted;

    if (!targeted) {
      for (const [material, state] of this.materialStates) {
        if (state.color !== undefined) material.color?.setHex(state.color);
        if (state.emissive !== undefined) material.emissive?.setHex(state.emissive);
        if (state.emissiveIntensity !== undefined) {
          material.emissiveIntensity = state.emissiveIntensity;
        }
      }
      return;
    }

    this.root.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (!renderable.material) return;
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const sourceMaterial of materials) {
        const material = sourceMaterial as EchoMaterial;
        if (!this.materialStates.has(material)) {
          this.materialStates.set(material, {
            color: material.color?.getHex(),
            emissive: material.emissive?.getHex(),
            emissiveIntensity: material.emissiveIntensity,
          });
        }
        material.color?.setHex(ECHO_ORANGE);
        if (material.emissive) {
          material.emissive.setHex(ECHO_ORANGE_EMISSIVE);
          material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 1.4);
        }
      }
    });
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (!mesh.material) return;
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) material.dispose();
      } else {
        mesh.material.dispose();
      }
    });
  }

  private emitActionsUntil(time: number): void {
    while (
      this.actionIndex < this.recording.actions.length &&
      this.recording.actions[this.actionIndex].time <= time
    ) {
      const action = this.recording.actions[this.actionIndex];
      if (action.type === 'shot') {
        const result = this.world.shoot(
          action.origin,
          action.direction,
          GAME_CONFIG.weapon.range,
          false,
        );
        this.world.spawnTracer(action.origin, result.point, ECHO_BLUE);
        if (result.hitTarget) this.onHit();
        this.audio.echoShot();
        this.muzzleFlashTimer = 0.055;
      } else {
        this.audio.echoReload();
      }
      this.actionIndex += 1;
    }
  }

  private setPose(time: number): void {
    const frames = this.recording.frames;
    if (time < frames[this.frameIndex].time) this.frameIndex = 0;
    while (
      this.frameIndex < frames.length - 2 &&
      frames[this.frameIndex + 1].time < time
    ) {
      this.frameIndex += 1;
    }

    const first = frames[this.frameIndex];
    const second = frames[Math.min(this.frameIndex + 1, frames.length - 1)];
    const span = Math.max(0.0001, second.time - first.time);
    const alpha = THREE.MathUtils.clamp((time - first.time) / span, 0, 1);
    this.root.position.lerpVectors(first.position, second.position, alpha);
    this.weaponAnchor.quaternion.slerpQuaternions(first.aim, second.aim, alpha);

    const ads = THREE.MathUtils.lerp(first.ads, second.ads, alpha);
    const hipPosition = new THREE.Vector3(0.2, -0.17, -0.18);
    const adsPosition = new THREE.Vector3(0, -0.12, -0.2);
    const weaponPosition = hipPosition.lerp(adsPosition, ads);

    const reloadProgress = this.getReloadProgress(time);
    let reloadSpin = 0;
    let pivotOffsetY = 0;
    let pivotOffsetZ = 0;
    if (reloadProgress !== null) {
      const eased = reloadProgress * reloadProgress * (3 - 2 * reloadProgress);
      reloadSpin = eased * Math.PI * 2;
      const pivotY = -0.1;
      const pivotZ = -0.28;
      const cosine = Math.cos(reloadSpin);
      const sine = Math.sin(reloadSpin);
      pivotOffsetY = pivotY - (pivotY * cosine - pivotZ * sine);
      pivotOffsetZ = pivotZ - (pivotY * sine + pivotZ * cosine);
    }
    this.weaponVisual.position.set(
      weaponPosition.x,
      weaponPosition.y + pivotOffsetY,
      weaponPosition.z + pivotOffsetZ,
    );
    this.weaponVisual.rotation.set(reloadSpin, 0, 0);
  }

  private getReloadProgress(time: number): number | null {
    for (const action of this.recording.actions) {
      if (action.type !== 'reload') continue;
      const progress = (time - action.time) / GAME_CONFIG.weapon.reloadSeconds;
      if (progress >= 0 && progress <= 1) return progress;
    }
    return null;
  }

  private buildWeapon(): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x7ed7ff,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const darkBlue = new THREE.MeshBasicMaterial({
      color: 0x168dce,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.17, 0.58), material);
    receiver.position.z = -0.35;
    this.weaponVisual.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 8), darkBlue);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.86);
    this.weaponVisual.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.16), darkBlue);
    grip.position.set(0, -0.18, -0.22);
    grip.rotation.x = -0.18;
    this.weaponVisual.add(grip);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.16), material);
    magazine.position.set(0, -0.2, -0.48);
    magazine.rotation.x = -0.08;
    this.weaponVisual.add(magazine);
  }
}
