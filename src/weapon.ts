import * as THREE from 'three';
import { GameAudio } from './audio';
import { GAME_CONFIG } from './config';
import { InputController } from './input';
import { PlayerController } from './player';
import { TrainingWorld } from './world';

export interface WeaponEventSink {
  recordShot(origin: THREE.Vector3, direction: THREE.Vector3): void;
  recordReload(): void;
  registerHit(chargeReward: number): void;
}

export class RifleController {
  private readonly model = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly muzzleFlash = new THREE.Group();
  private readonly muzzleLight = new THREE.PointLight(0xffb45c, 0, 3);
  private ammo: number = GAME_CONFIG.weapon.magazineSize;
  private cooldown = 0;
  private reloadTimer = 0;
  private recoilVisual = 0;
  private muzzleFlashTimer = 0;
  private spreadBloom = 0;
  private shotsInBurst = 0;
  private timeSinceLastShot = Number.POSITIVE_INFINITY;
  private swayX = 0;
  private swayY = 0;
  private dryFireLatch = false;
  private ads = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputController,
    private readonly player: PlayerController,
    private readonly world: TrainingWorld,
    private readonly audio: GameAudio,
    private readonly eventSink?: WeaponEventSink,
  ) {
    this.buildModel();
    camera.add(this.model);
  }

  get ammoInMagazine(): number {
    return this.ammo;
  }

  get isReloading(): boolean {
    return this.reloadTimer > 0;
  }

  get adsAmount(): number {
    return this.ads;
  }

  get crosshairSpread(): number {
    const config = GAME_CONFIG.weapon;
    const adsScale = THREE.MathUtils.lerp(1, config.adsSpreadMultiplier, this.ads);
    const visibleBloom = this.spreadBloom * adsScale;
    return THREE.MathUtils.clamp(
      visibleBloom / (config.maxSpread - config.baseSpread),
      0,
      1,
    );
  }

  dispose(): void {
    this.model.removeFromParent();
    this.model.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose();
      if (!renderable.material) return;
      if (Array.isArray(renderable.material)) {
        for (const material of renderable.material) material.dispose();
      } else {
        renderable.material.dispose();
      }
    });
  }

  update(deltaSeconds: number, active: boolean): void {
    const config = GAME_CONFIG.weapon;
    this.cooldown = Math.max(0, this.cooldown - deltaSeconds);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - deltaSeconds);
    this.muzzleFlash.visible = this.muzzleFlashTimer > 0;
    this.muzzleLight.intensity = this.muzzleFlashTimer > 0 ? 9 : 0;
    this.recoilVisual = THREE.MathUtils.damp(this.recoilVisual, 0, 20, deltaSeconds);
    this.timeSinceLastShot += deltaSeconds;
    if (this.timeSinceLastShot >= config.spreadRecoveryDelay) {
      const recoveryRate =
        this.shotsInBurst <= 4
          ? config.shortBurstRecoveryRate
          : config.longBurstRecoveryRate;
      this.spreadBloom = Math.max(0, this.spreadBloom - recoveryRate * deltaSeconds);
    }
    if (this.timeSinceLastShot >= config.sprayResetDelay) {
      this.shotsInBurst = 0;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= deltaSeconds;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.ammo = config.magazineSize;
      }
    }

    if (active && this.input.wasPressed('KeyR') && this.ammo < config.magazineSize) {
      this.startReload();
    }

    const wantsAds = active && this.input.isMouseDown(2) && !this.isReloading;
    this.ads = THREE.MathUtils.damp(this.ads, wantsAds ? 1 : 0, 14, deltaSeconds);
    const targetFov = THREE.MathUtils.lerp(
      GAME_CONFIG.camera.hipFov,
      GAME_CONFIG.camera.adsFov,
      this.ads,
    );
    const nextFov = THREE.MathUtils.damp(
      this.camera.fov,
      targetFov,
      GAME_CONFIG.camera.fovLerpSpeed,
      deltaSeconds,
    );
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    const firing = active && this.input.isMouseDown(0);
    if (!firing) this.dryFireLatch = false;
    if (firing && !this.isReloading && this.cooldown <= 0) {
      if (this.ammo > 0) {
        this.fire();
        this.cooldown = 60 / config.roundsPerMinute;
        if (this.ammo === 0) this.startReload();
      } else if (!this.dryFireLatch) {
        this.audio.dryFire();
        this.dryFireLatch = true;
        this.startReload();
      }
    }

    this.updateModel(deltaSeconds);
  }

  private fire(): void {
    const config = GAME_CONFIG.weapon;
    this.ammo -= 1;
    this.recoilVisual = Math.min(1, this.recoilVisual + 0.75);
    this.audio.shot(this.ammo === 0);

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const spreadScale = THREE.MathUtils.lerp(1, config.adsSpreadMultiplier, this.ads);
    const spread = (config.baseSpread + this.spreadBloom) * spreadScale;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spread;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    direction
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius)
      .normalize();

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.eventSink?.recordShot(origin, direction);
    const result = this.world.shoot(origin, direction, config.range, true, this.player);
    const muzzlePosition = new THREE.Vector3();
    this.muzzle.getWorldPosition(muzzlePosition);
    this.world.spawnTracer(muzzlePosition, result.point);

    if (result.hitTarget) {
      this.audio.hit();
      this.eventSink?.registerHit(result.detonationChargeReward);
    }

    const recoilProgress = THREE.MathUtils.clamp(
      this.shotsInBurst / Math.max(1, config.recoilRampShots - 1),
      0,
      1,
    );
    const recoilCurve = Math.pow(recoilProgress, 0.72);
    const recoilScale = THREE.MathUtils.lerp(1, config.adsRecoilMultiplier, this.ads);
    const yawRamp = Math.min(1, this.shotsInBurst / 5);
    const patternedYaw = Math.sin((this.shotsInBurst + 1) * 1.7) * config.recoilYawPattern;
    const randomYaw = (Math.random() * 2 - 1) * config.recoilYawRandom;
    this.player.addRecoil(
      THREE.MathUtils.lerp(config.recoilPitchMin, config.recoilPitchMax, recoilCurve) *
        recoilScale,
      (patternedYaw + randomYaw) * yawRamp * recoilScale,
    );

    this.shotsInBurst += 1;
    this.timeSinceLastShot = 0;
    this.spreadBloom = Math.min(
      config.maxSpread - config.baseSpread,
      this.spreadBloom + config.spreadPerShot,
    );

    this.muzzleFlashTimer = 0.035;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    this.muzzleFlash.scale.setScalar(0.75 + Math.random() * 0.45);
    this.muzzleLight.intensity = 9;
  }

  private startReload(): void {
    if (this.isReloading) return;
    this.reloadTimer = GAME_CONFIG.weapon.reloadSeconds;
    this.audio.reload();
    this.eventSink?.recordReload();
  }

  private updateModel(deltaSeconds: number): void {
    const mouseDelta = this.input.consumeMouseDelta();
    this.swayX = THREE.MathUtils.damp(this.swayX, -mouseDelta.x * 0.00035, 12, deltaSeconds);
    this.swayY = THREE.MathUtils.damp(this.swayY, mouseDelta.y * 0.0003, 12, deltaSeconds);

    const hipPosition = new THREE.Vector3(0.34, -0.31, -0.62);
    // Keep the lowered iron sights below the HUD reticle instead of covering it during ADS.
    const adsPosition = new THREE.Vector3(0, -0.24, -0.54);
    const position = hipPosition.lerp(adsPosition, this.ads);
    position.z += this.recoilVisual * 0.075;

    let reloadSpinX = 0;
    let pivotOffsetY = 0;
    let pivotOffsetZ = 0;
    let reloadLift = 0;
    if (this.isReloading) {
      const progress = THREE.MathUtils.clamp(
        1 - this.reloadTimer / GAME_CONFIG.weapon.reloadSeconds,
        0,
        1,
      );
      const eased = progress * progress * (3 - 2 * progress);
      reloadSpinX = eased * Math.PI * 2;

      // The trigger finger points left-to-right, so it forms the local X rotation axis.
      // Position compensation keeps that trigger point fixed while the rifle flips around it.
      const pivotY = -0.1;
      const pivotZ = -0.28;
      const cosine = Math.cos(reloadSpinX);
      const sine = Math.sin(reloadSpinX);
      const rotatedY = pivotY * cosine - pivotZ * sine;
      const rotatedZ = pivotY * sine + pivotZ * cosine;
      pivotOffsetY = pivotY - rotatedY;
      pivotOffsetZ = pivotZ - rotatedZ;
      reloadLift = Math.sin(progress * Math.PI) * 0.035;
    }

    this.model.position.set(
      position.x + this.swayX * (1 - this.ads),
      position.y + this.swayY * (1 - this.ads) + pivotOffsetY + reloadLift,
      position.z + pivotOffsetZ,
    );
    this.model.rotation.set(
      reloadSpinX + this.swayY * 0.7 + this.recoilVisual * 0.05,
      this.swayX * 0.8,
      0,
    );
  }

  private buildModel(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e3df,
      roughness: 0.42,
      metalness: 0.28,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2428,
      roughness: 0.5,
      metalness: 0.55,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xe93640,
      emissive: 0x8c1018,
      emissiveIntensity: 0.45,
      roughness: 0.45,
    });

    const addPart = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      rotation = new THREE.Euler(),
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.copy(rotation);
      mesh.castShadow = false;
      this.model.add(mesh);
      return mesh;
    };

    addPart(new THREE.BoxGeometry(0.19, 0.2, 0.62), bodyMaterial, [0, 0, -0.3]);
    addPart(new THREE.BoxGeometry(0.13, 0.12, 0.48), darkMaterial, [0, 0.03, -0.82]);
    addPart(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 12), darkMaterial, [0, 0.03, -1.16], new THREE.Euler(Math.PI / 2, 0, 0));
    addPart(new THREE.BoxGeometry(0.14, 0.28, 0.2), darkMaterial, [0, -0.2, -0.18], new THREE.Euler(-0.18, 0, 0));
    addPart(new THREE.BoxGeometry(0.13, 0.32, 0.17), accentMaterial, [0, -0.22, -0.48], new THREE.Euler(-0.08, 0, 0));
    addPart(new THREE.BoxGeometry(0.08, 0.035, 0.22), darkMaterial, [0, 0.118, -0.3]);
    // Low front post plus an open rear notch: neither piece occupies the screen center in ADS.
    addPart(new THREE.BoxGeometry(0.018, 0.04, 0.025), accentMaterial, [0, 0.15, -0.76]);
    addPart(new THREE.BoxGeometry(0.018, 0.05, 0.025), accentMaterial, [-0.043, 0.15, -0.08]);
    addPart(new THREE.BoxGeometry(0.018, 0.05, 0.025), accentMaterial, [0.043, 0.15, -0.08]);

    this.muzzle.position.set(0, 0.03, -1.42);
    this.model.add(this.muzzle);

    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc469,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flashA = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), flashMaterial);
    const flashB = flashA.clone();
    flashB.rotation.y = Math.PI / 2;
    this.muzzleFlash.add(flashA, flashB);
    this.muzzleFlash.position.copy(this.muzzle.position);
    this.muzzleFlash.visible = false;
    this.model.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzle.position);
    this.model.add(this.muzzleLight);

    this.model.position.set(0.34, -0.31, -0.62);
  }
}
