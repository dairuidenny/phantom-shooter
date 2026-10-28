import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { LevelId } from './levels';

export interface ShotResult {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  hitTarget: boolean;
}

interface TargetState {
  group: THREE.Group;
  plate: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  origin: THREE.Vector3;
  moving: boolean;
  phase: number;
  flash: number;
}

interface EnemyState {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  health: number;
  attackCooldown: number;
  attackFlash: number;
}

interface EnemyDeathAnimation {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  direction: THREE.Vector3;
  rotationAxis: THREE.Vector3;
  elapsed: number;
  duration: number;
  blastVelocity?: THREE.Vector3;
  spinAxis?: THREE.Vector3;
}

interface DamageNumberState {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  startPosition: THREE.Vector3;
  elapsed: number;
  duration: number;
}

interface EnemySpawnEvent {
  time: number;
  hour: number;
}

interface TimedObject {
  object: THREE.Object3D;
  life: number;
  maxLife: number;
  velocity?: THREE.Vector3;
  material?: THREE.Material;
  scaleSpeed?: number;
}

const COLORS = {
  white: 0xe9e9e5,
  light: 0xf8f8f4,
  mid: 0xbfc1be,
  dark: 0x24272a,
  red: 0xf0323c,
  glow: 0xff5a62,
};

const FIRST_WAVE_SPAWN_HOURS = [11, 1, 12] as const;
const ENEMIES_PER_SUBWAVE = 10;
const SUBWAVE_SPAWN_SECONDS = 1;
const SUBWAVE_GAP_SECONDS = 1;
const ENEMY_DEATH_SECONDS = 0.425;
const DAMAGE_NUMBER_SECONDS = 0.9;
const ENEMY_BASE_COLOR = 0xe32932;
const ENEMY_HIT_COLOR = new THREE.Color(0xffffff);

export class TrainingWorld {
  readonly scene = new THREE.Scene();
  private readonly shootables: THREE.Object3D[] = [];
  private readonly targets: TargetState[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly enemyDeaths: EnemyDeathAnimation[] = [];
  private readonly damageNumbers: DamageNumberState[] = [];
  private readonly effects: TimedObject[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly spawnEvents: EnemySpawnEvent[] = [];
  private elapsed = 0;
  private hits = 0;
  private shots = 0;
  private nextSpawnIndex = 0;
  private currentWaveNumber = 1;
  private waveElapsed = 0;
  private waveIntermission = 0;
  private remainingEnemies = 0;
  private towerHealth: number = GAME_CONFIG.defense.towerMaxHealth;
  private failed = false;

  constructor(
    private readonly physicsWorld: RAPIER.World,
    readonly levelId: LevelId,
  ) {
    this.scene.background = new THREE.Color(0xd7d9dc);
    this.scene.fog = new THREE.Fog(
      0xd7d9dc,
      levelId === 'spire' ? 58 : 26,
      levelId === 'spire' ? 115 : 68,
    );
    this.buildLighting();
    if (levelId === 'training') {
      this.buildTrainingArena();
      this.buildTargets();
    } else {
      this.buildDefenseArena();
      this.prepareWave(1);
    }
  }

  get hasDefenseObjective(): boolean {
    return this.levelId === 'spire';
  }

  get baseHealthFraction(): number {
    return THREE.MathUtils.clamp(
      this.towerHealth / GAME_CONFIG.defense.towerMaxHealth,
      0,
      1,
    );
  }

  get baseHealth(): number {
    return Math.max(0, Math.ceil(this.towerHealth));
  }

  get currentWave(): number {
    return this.levelId === 'spire' ? this.currentWaveNumber : 0;
  }

  get remainingEnemyCount(): number {
    return this.remainingEnemies;
  }

  get isBetweenWaves(): boolean {
    return this.levelId === 'spire' && this.remainingEnemies === 0 && this.waveIntermission > 0;
  }

  get nextWaveSeconds(): number {
    return Math.max(0, Math.ceil(this.waveIntermission));
  }

  get isFailed(): boolean {
    return this.failed;
  }

  update(deltaSeconds: number): void {
    if (this.failed) return;
    this.elapsed += deltaSeconds;
    for (const target of this.targets) {
      if (target.moving) {
        target.group.position.x = target.origin.x + Math.sin(this.elapsed * 1.35 + target.phase) * 4.4;
      }
      target.flash = Math.max(0, target.flash - deltaSeconds);
      const flashAmount = Math.min(1, target.flash * 8);
      target.material.emissive.setHex(COLORS.glow);
      target.material.emissiveIntensity = flashAmount * 2.2;
      const targetScale = 1 + flashAmount * 0.09;
      target.plate.scale.setScalar(targetScale);
    }

    if (this.levelId === 'spire') {
      this.updateWave(deltaSeconds);
      this.updateEnemies(deltaSeconds);
      this.updateEnemyDeaths(deltaSeconds);
      this.updateDamageNumbers(deltaSeconds);
    }

    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= deltaSeconds;
      if (effect.velocity) {
        effect.velocity.y -= 9 * deltaSeconds;
        effect.object.position.addScaledVector(effect.velocity, deltaSeconds);
      }
      if (effect.material) {
        effect.material.opacity = Math.max(0, effect.life / effect.maxLife);
      }
      if (effect.scaleSpeed) {
        const growth = effect.scaleSpeed * deltaSeconds;
        effect.object.scale.addScalar(growth);
      }
      if (effect.life <= 0) {
        effect.object.removeFromParent();
        const disposable = effect.object as THREE.Mesh;
        disposable.geometry?.dispose();
        effect.material?.dispose();
        this.effects.splice(index, 1);
      }
    }
  }

  shoot(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
    countStats = true,
  ): ShotResult {
    if (countStats) this.shots += 1;
    this.raycaster.set(origin, direction);
    this.raycaster.far = range;
    const intersection = this.raycaster.intersectObjects(this.shootables, false)[0];
    if (!intersection) {
      return {
        point: origin.clone().addScaledVector(direction, range),
        normal: direction.clone().negate(),
        hitTarget: false,
      };
    }

    const normal = intersection.face
      ? intersection.face.normal
          .clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld))
          .normalize()
      : direction.clone().negate();
    const target = this.targets.find((candidate) => candidate.plate === intersection.object);
    const enemy = this.enemies.find((candidate) => candidate.mesh === intersection.object);
    if (target) {
      target.flash = 0.15;
      if (countStats) this.hits += 1;
      this.spawnImpactParticles(intersection.point, normal, COLORS.red);
    } else if (enemy) {
      if (countStats) this.hits += 1;
      const damage = GAME_CONFIG.weapon.damage;
      enemy.health -= damage;
      enemy.attackFlash = 0.18;
      this.spawnDamageNumber(intersection.point, damage);
      this.spawnImpactParticles(intersection.point, normal, 0xff3b30);
      if (enemy.health <= 0) this.killEnemy(enemy, direction);
    } else {
      this.spawnDecal(intersection.point, normal);
      this.spawnImpactParticles(intersection.point, normal, COLORS.dark);
    }

    return {
      point: intersection.point.clone(),
      normal,
      hitTarget: Boolean(target || enemy),
    };
  }

  getRayHitDistance(origin: THREE.Vector3, direction: THREE.Vector3, range: number): number {
    this.raycaster.set(origin, direction);
    this.raycaster.far = range;
    return this.raycaster.intersectObjects(this.shootables, false)[0]?.distance ?? range;
  }

  spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color = 0xffd17a): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 4;
    this.scene.add(line);
    this.effects.push({ object: line, life: 0.045, maxLife: 0.045, material });
  }

  spawnEchoExplosion(position: THREE.Vector3): void {
    this.damageEnemiesInEchoExplosion(position);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xbdeaff,
      transparent: true,
      opacity: 0.9,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), coreMaterial);
    core.position.copy(position);
    core.scale.setScalar(0.15);
    this.scene.add(core);
    this.effects.push({
      object: core,
      life: 0.48,
      maxLife: 0.48,
      material: coreMaterial,
      scaleSpeed: 12,
    });

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x45bfff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 8, 48), ringMaterial);
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.2);
    this.scene.add(ring);
    this.effects.push({
      object: ring,
      life: 0.52,
      maxLife: 0.52,
      material: ringMaterial,
      scaleSpeed: 18,
    });

    for (let index = 0; index < 18; index += 1) {
      const geometry = new THREE.BoxGeometry(0.055, 0.055, 0.16 + Math.random() * 0.18);
      const material = new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xffffff : 0x48bfff,
        transparent: true,
        opacity: 1,
      });
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(position);
      particle.quaternion.random();
      this.scene.add(particle);
      const velocity = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.7 + 0.15,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(8 + Math.random() * 8);
      this.effects.push({ object: particle, life: 0.55, maxLife: 0.55, velocity, material });
    }
  }

  getAccuracy(): { hits: number; shots: number } {
    return { hits: this.hits, shots: this.shots };
  }

  dispose(): void {
    this.scene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose();
      if (!renderable.material) return;
      if (Array.isArray(renderable.material)) {
        for (const material of renderable.material) material.dispose();
      } else {
        renderable.material.dispose();
      }
    });
    for (const damageNumber of this.damageNumbers) damageNumber.texture.dispose();
    this.scene.clear();
    this.shootables.length = 0;
    this.targets.length = 0;
    this.enemies.length = 0;
    this.enemyDeaths.length = 0;
    this.damageNumbers.length = 0;
    this.effects.length = 0;
  }

  private updateWave(deltaSeconds: number): void {
    if (this.remainingEnemies <= 0) {
      this.waveIntermission = Math.max(0, this.waveIntermission - deltaSeconds);
      if (this.waveIntermission <= 0) this.prepareWave(this.currentWaveNumber + 1);
      return;
    }

    this.waveElapsed += deltaSeconds;
    while (
      this.nextSpawnIndex < this.spawnEvents.length &&
      this.spawnEvents[this.nextSpawnIndex].time <= this.waveElapsed
    ) {
      this.spawnEnemy(this.spawnEvents[this.nextSpawnIndex].hour);
      this.nextSpawnIndex += 1;
    }
  }

  private updateEnemies(deltaSeconds: number): void {
    const config = GAME_CONFIG.defense;
    for (const enemy of this.enemies) {
      enemy.attackFlash = Math.max(0, enemy.attackFlash - deltaSeconds);
      const flashAmount = THREE.MathUtils.clamp(enemy.attackFlash / 0.18, 0, 1);
      enemy.material.color.setHex(ENEMY_BASE_COLOR).lerp(ENEMY_HIT_COLOR, flashAmount * 0.92);
      enemy.material.emissive.setHex(0xffffff);
      enemy.material.emissiveIntensity = flashAmount * 4.5;
      const distance = Math.hypot(enemy.mesh.position.x, enemy.mesh.position.z);
      if (distance > config.towerAttackRadius) {
        const moveDistance = Math.min(
          config.enemySpeed * deltaSeconds,
          distance - config.towerAttackRadius,
        );
        enemy.mesh.position.x -= (enemy.mesh.position.x / distance) * moveDistance;
        enemy.mesh.position.z -= (enemy.mesh.position.z / distance) * moveDistance;
        continue;
      }

      enemy.attackCooldown -= deltaSeconds;
      if (enemy.attackCooldown <= 0) {
        this.towerHealth = Math.max(0, this.towerHealth - config.enemyAttackDamage);
        enemy.attackCooldown += config.enemyAttackInterval;
        enemy.attackFlash = 0.18;
        if (this.towerHealth <= 0) {
          this.failed = true;
          return;
        }
      }
    }
  }

  private prepareWave(waveNumber: number): void {
    const spawnHours: readonly number[] = FIRST_WAVE_SPAWN_HOURS;
    const enemiesPerSubwave = ENEMIES_PER_SUBWAVE;
    const spawnSeconds = SUBWAVE_SPAWN_SECONDS;
    const subwaveDuration = spawnSeconds + SUBWAVE_GAP_SECONDS;

    this.spawnEvents.length = 0;
    this.nextSpawnIndex = 0;
    this.waveElapsed = 0;
    this.waveIntermission = 0;
    this.currentWaveNumber = waveNumber;
    for (let subwave = 0; subwave < spawnHours.length; subwave += 1) {
      const startTime = subwave * subwaveDuration;
      for (let enemy = 0; enemy < enemiesPerSubwave; enemy += 1) {
        this.spawnEvents.push({
          time: startTime + (enemy / (enemiesPerSubwave - 1)) * spawnSeconds,
          hour: spawnHours[subwave],
        });
      }
    }
    this.remainingEnemies = this.spawnEvents.length;
  }

  private spawnEnemy(hour: number): void {
    const config = GAME_CONFIG.defense;
    const baseAngle = ((hour % 12) / 12) * Math.PI * 2;
    const angle = baseAngle + THREE.MathUtils.degToRad(
      (Math.random() * 2 - 1) * config.spawnAngleJitterDegrees,
    );
    const material = new THREE.MeshStandardMaterial({
      color: ENEMY_BASE_COLOR,
      roughness: 0.56,
      emissive: 0x8d0810,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        GAME_CONFIG.player.radius,
        GAME_CONFIG.player.halfHeight * 2,
        6,
        12,
      ),
      material,
    );
    mesh.position.set(
      Math.sin(angle) * config.spawnRadius,
      GAME_CONFIG.player.radius + GAME_CONFIG.player.halfHeight,
      -Math.cos(angle) * config.spawnRadius,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.shootables.push(mesh);
    this.enemies.push({
      mesh,
      material,
      health: config.enemyHealth,
      attackCooldown: config.enemyAttackInterval,
      attackFlash: 0,
    });
  }

  private damageEnemiesInEchoExplosion(position: THREE.Vector3): void {
    const echoConfig = GAME_CONFIG.echo;
    const damage = GAME_CONFIG.defense.enemyHealth * echoConfig.explosionDamageMultiplier;
    for (const enemy of [...this.enemies]) {
      const offset = enemy.mesh.position.clone().sub(position);
      const planarDistance = Math.hypot(offset.x, offset.z);
      if (planarDistance > echoConfig.explosionRadius) continue;

      const outward = offset.setY(0);
      if (outward.lengthSq() < 0.0001) {
        outward.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      }
      outward.normalize();
      enemy.health -= damage;
      enemy.attackFlash = 0.18;
      this.spawnDamageNumber(enemy.mesh.position, damage);
      const blastVelocity = outward
        .clone()
        .multiplyScalar(echoConfig.explosionHorizontalSpeed);
      blastVelocity.y = echoConfig.explosionVerticalSpeed;
      if (enemy.health <= 0) this.killEnemy(enemy, outward, blastVelocity);
    }
  }

  private killEnemy(
    enemy: EnemyState,
    shotDirection: THREE.Vector3,
    blastVelocity?: THREE.Vector3,
  ): void {
    const enemyIndex = this.enemies.indexOf(enemy);
    if (enemyIndex >= 0) this.enemies.splice(enemyIndex, 1);
    const shootableIndex = this.shootables.indexOf(enemy.mesh);
    if (shootableIndex >= 0) this.shootables.splice(shootableIndex, 1);

    const direction = shotDirection.clone().setY(0);
    if (direction.lengthSq() < 0.0001) {
      direction.copy(enemy.mesh.position).setY(0);
    }
    direction.normalize();
    const rotationAxis = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    enemy.material.color.setHex(0x441116);
    enemy.material.emissive.setHex(0x000000);
    enemy.material.emissiveIntensity = 0;
    this.enemyDeaths.push({
      mesh: enemy.mesh,
      material: enemy.material,
      startPosition: enemy.mesh.position.clone(),
      startQuaternion: enemy.mesh.quaternion.clone(),
      direction,
      rotationAxis,
      elapsed: 0,
      duration: ENEMY_DEATH_SECONDS,
      blastVelocity,
      spinAxis: blastVelocity
        ? new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
        : undefined,
    });

    this.remainingEnemies = Math.max(0, this.remainingEnemies - 1);
    if (this.remainingEnemies === 0) {
      this.waveIntermission = GAME_CONFIG.defense.waveIntermissionSeconds;
    }
  }

  private updateEnemyDeaths(deltaSeconds: number): void {
    for (let index = this.enemyDeaths.length - 1; index >= 0; index -= 1) {
      const death = this.enemyDeaths[index];
      death.elapsed = Math.min(death.duration, death.elapsed + deltaSeconds);
      const progress = death.elapsed / death.duration;
      if (death.blastVelocity) {
        death.mesh.position.addScaledVector(death.blastVelocity, deltaSeconds);
        death.blastVelocity.y -= 14 * deltaSeconds;
        if (death.spinAxis) {
          const spin = new THREE.Quaternion().setFromAxisAngle(
            death.spinAxis,
            deltaSeconds * 9,
          );
          death.mesh.quaternion.premultiply(spin);
        }
      } else {
        const knockback = 1 - Math.pow(1 - progress, 3);
        const fall = THREE.MathUtils.smoothstep(progress, 0.08, 0.82);
        death.mesh.position
          .copy(death.startPosition)
          .addScaledVector(death.direction, knockback * 1.65);
        death.mesh.position.y -= GAME_CONFIG.player.halfHeight * fall;
        const fallRotation = new THREE.Quaternion().setFromAxisAngle(
          death.rotationAxis,
          fall * Math.PI * 0.5,
        );
        death.mesh.quaternion.copy(death.startQuaternion).premultiply(fallRotation);
      }

      if (progress >= 1) {
        death.mesh.removeFromParent();
        death.mesh.geometry.dispose();
        death.material.dispose();
        this.enemyDeaths.splice(index, 1);
      }
    }
  }

  private spawnDamageNumber(position: THREE.Vector3, damage: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 42px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = 8;
    context.strokeStyle = '#000000';
    context.strokeText(damage.toString(), 64, 32);
    context.fillStyle = '#ffffff';
    context.fillText(damage.toString(), 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const startPosition = position.clone().add(new THREE.Vector3(0, 0.35, 0));
    sprite.position.copy(startPosition);
    sprite.scale.set(1.25, 0.625, 1);
    sprite.renderOrder = 12;
    this.scene.add(sprite);
    this.damageNumbers.push({
      sprite,
      material,
      texture,
      startPosition,
      elapsed: 0,
      duration: DAMAGE_NUMBER_SECONDS,
    });
  }

  private updateDamageNumbers(deltaSeconds: number): void {
    for (let index = this.damageNumbers.length - 1; index >= 0; index -= 1) {
      const damageNumber = this.damageNumbers[index];
      damageNumber.elapsed = Math.min(
        damageNumber.duration,
        damageNumber.elapsed + deltaSeconds,
      );
      const progress = damageNumber.elapsed / damageNumber.duration;
      let height: number;
      if (progress <= 0.55) {
        const rise = THREE.MathUtils.smoothstep(progress / 0.55, 0, 1);
        height = rise * 1.2;
        damageNumber.material.opacity = 1;
      } else {
        const fall = THREE.MathUtils.smoothstep((progress - 0.55) / 0.45, 0, 1);
        height = 1.2 - fall * 0.6;
        damageNumber.material.opacity = 1 - fall;
      }
      damageNumber.sprite.position.copy(damageNumber.startPosition);
      damageNumber.sprite.position.y += height;

      if (progress >= 1) {
        damageNumber.sprite.removeFromParent();
        damageNumber.material.dispose();
        damageNumber.texture.dispose();
        this.damageNumbers.splice(index, 1);
      }
    }
  }

  private buildDefenseArena(): void {
    const radius = GAME_CONFIG.defense.arenaRadius;
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.white,
      roughness: 0.84,
    });
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 1, 64),
      floorMaterial,
    );
    floor.name = 'Defense arena floor';
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.shootables.push(floor);
    this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.cylinder(0.5, radius)
        .setTranslation(0, -0.5, 0)
        .setFriction(0.1),
    );

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius - 0.35, 0.12, 8, 96),
      new THREE.MeshBasicMaterial({ color: COLORS.red }),
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = 0.02;
    this.scene.add(outerRing);

    const padGeometry = new THREE.CircleGeometry(0.72, 24);
    for (let hour = 1; hour <= 12; hour += 1) {
      const angle = ((hour % 12) / 12) * Math.PI * 2;
      const activeSpawn = [1, 11, 12].includes(hour);
      const pad = new THREE.Mesh(
        padGeometry,
        new THREE.MeshBasicMaterial({ color: activeSpawn ? COLORS.red : COLORS.mid }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(
        Math.sin(angle) * GAME_CONFIG.defense.spawnRadius,
        0.012,
        -Math.cos(angle) * GAME_CONFIG.defense.spawnRadius,
      );
      this.scene.add(pad);
    }

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.dark,
      roughness: 0.58,
      metalness: 0.35,
    });
    this.addBox('Spire base', [4.2, 0.8, 4.2], [0, 0.4, 0], baseMaterial);
    const obeliskMaterial = new THREE.MeshStandardMaterial({
      color: 0x30363a,
      roughness: 0.42,
      metalness: 0.48,
      emissive: 0x087dc2,
      emissiveIntensity: 0.34,
    });
    const obelisk = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 6.8, 4),
      obeliskMaterial,
    );
    obelisk.name = 'Spire obelisk';
    obelisk.position.y = 4.2;
    obelisk.rotation.y = Math.PI / 4;
    obelisk.castShadow = true;
    obelisk.receiveShadow = true;
    this.scene.add(obelisk);
    this.shootables.push(obelisk);
    this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(1.1, 3.4, 1.1).setTranslation(0, 4.2, 0),
    );
  }

  private buildLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x888888, 2.3);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(12, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadowExtent = this.levelId === 'spire' ? 60 : 30;
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = this.levelId === 'spire' ? 120 : 70;
    sun.shadow.bias = -0.00015;
    this.scene.add(sun);
  }

  private buildTrainingArena(): void {
    const white = new THREE.MeshStandardMaterial({ color: COLORS.white, roughness: 0.82 });
    const light = new THREE.MeshStandardMaterial({ color: COLORS.light, roughness: 0.75 });
    const mid = new THREE.MeshStandardMaterial({ color: COLORS.mid, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.68 });
    const red = new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.72 });

    this.addBox('Floor', [50, 1, 50], [0, -0.5, 0], white);
    this.addBox('North wall', [50, 6, 1], [0, 3, -25], light);
    this.addBox('West wall', [1, 6, 50], [-25, 3, 0], light);
    this.addBox('East wall', [1, 6, 50], [25, 3, 0], light);
    this.addBox('South left wall', [18, 5, 1], [-16, 2.5, 25], light);
    this.addBox('South right wall', [18, 5, 1], [16, 2.5, 25], light);

    this.addBox('Start arch left', [1.2, 4.6, 1.2], [-3.5, 2.3, 11], dark);
    this.addBox('Start arch right', [1.2, 4.6, 1.2], [3.5, 2.3, 11], dark);
    this.addBox('Start arch top', [8.2, 0.7, 1.2], [0, 4.25, 11], dark);

    this.addBox('Center cover left', [5, 2.2, 1.2], [-5.5, 1.1, 3.5], light);
    this.addBox('Center cover right', [5, 1.4, 1.2], [5.5, 0.7, 3.5], light);

    // Open jump deck: low enough to mount directly, without creating an overhead cavity.
    this.addBox('Center jump deck', [7, 0.8, 6], [0, 0.4, -3.5], light);
    this.addBox('Center deck cover', [3.8, 1.15, 0.7], [0, 1.38, -6.15], mid);
    this.addBox('Center deck accent', [7.05, 0.16, 0.18], [0, 0.72, -0.48], red, undefined, false);

    // Left high route, reached by a broad exposed ramp.
    this.addBox('Left platform', [8, 0.7, 9], [-10, 2.5, -7], light);
    this.addBox(
      'Left ramp',
      [4, 0.55, 10],
      [-10, 1.4, 0],
      light,
      new THREE.Euler(0.255, 0, 0),
    );
    this.addBox('Left platform rail', [0.35, 2, 8], [-14, 3.6, -7], dark);
    this.addBox('Left platform cover', [4.5, 1.6, 0.7], [-10, 3.55, -10.7], mid);

    // Right mid route replaces the former staircase with another traversable ramp.
    this.addBox('Right mid platform', [7, 0.7, 7], [9, 1.55, -1], light);
    this.addBox(
      'Right approach ramp',
      [3.6, 0.5, 7],
      [9, 0.95, 5.6],
      white,
      new THREE.Euler(0.235, 0, 0),
    );
    this.addBox('Right mid cover', [0.9, 2.5, 3.4], [11.7, 3.15, -1], mid);

    // A second ramp continues from the mid route to the highest open platform.
    this.addBox('Back high platform', [8, 0.7, 7], [10, 3.8, -17.5], light);
    this.addBox(
      'Back high ramp',
      [3.5, 0.55, 10],
      [10, 2.95, -9.5],
      light,
      new THREE.Euler(0.235, 0, 0),
    );
    this.addBox('Back high rail', [0.35, 1.8, 6.5], [13.8, 4.85, -17.5], dark);
    this.addBox('Back high cover', [4.2, 1.2, 0.7], [10, 4.75, -20.55], mid);

    // Small offset decks make the central lane a jump route instead of a flat corridor.
    this.addBox('Jump deck west', [4, 0.6, 4], [-3.4, 1.2, -12.2], white);
    this.addBox('Jump deck east', [4, 0.6, 4], [2.7, 1.9, -17], light);
    this.addBox('Back cover left', [4.5, 1.5, 0.8], [-10, 0.75, -16], light);

    const stripeGeometry = new THREE.PlaneGeometry(12, 0.16);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.red });
    for (const z of [8, 1, -12, -22]) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.006, z);
      this.scene.add(stripe);
    }
  }

  private buildTargets(): void {
    this.addTarget(new THREE.Vector3(-3.5, 2.6, -10.8), false, 0);
    this.addTarget(new THREE.Vector3(2.7, 3.85, -17), false, 0);
    this.addTarget(new THREE.Vector3(-10, 4.4, -10.5), false, 0);
    this.addTarget(new THREE.Vector3(10, 5.7, -20.4), false, 0);
    this.addTarget(new THREE.Vector3(0, 2.4, -23.5), true, 0);
    this.addTarget(new THREE.Vector3(0, 4.4, -23.2), true, Math.PI);
  }

  private addTarget(origin: THREE.Vector3, moving: boolean, phase: number): void {
    const group = new THREE.Group();
    group.position.copy(origin);

    const postMaterial = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.75 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.7, 0.07), postMaterial);
    post.position.set(0, -1.15, -0.14);
    post.castShadow = true;
    group.add(post);

    const material = new THREE.MeshStandardMaterial({
      color: COLORS.red,
      roughness: 0.58,
      emissive: COLORS.glow,
      emissiveIntensity: 0,
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.4, 0.16), material);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.03, 24),
      new THREE.MeshStandardMaterial({ color: COLORS.light, roughness: 0.6 }),
    );
    center.rotation.x = Math.PI / 2;
    center.position.z = 0.1;
    plate.add(center);

    this.scene.add(group);
    this.shootables.push(plate);
    this.targets.push({
      group,
      plate,
      material,
      origin: origin.clone(),
      moving,
      phase,
      flash: 0,
    });
  }

  private addBox(
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    rotation = new THREE.Euler(),
    collision = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.copy(rotation);
    mesh.castShadow = position[1] > 0;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.shootables.push(mesh);

    if (collision) {
      const quaternion = new THREE.Quaternion().setFromEuler(rotation);
      const collider = RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setTranslation(...position)
        .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
        .setFriction(0.1);
      this.physicsWorld.createCollider(collider);
    }
    return mesh;
  }

  private spawnDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const geometry = new THREE.CircleGeometry(0.055 + Math.random() * 0.025, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x3d3f41,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const decal = new THREE.Mesh(geometry, material);
    decal.position.copy(point).addScaledVector(normal, 0.004);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.scene.add(decal);
    this.effects.push({ object: decal, life: 8, maxLife: 8, material });
  }

  private spawnImpactParticles(point: THREE.Vector3, normal: THREE.Vector3, color: number): void {
    for (let index = 0; index < 5; index += 1) {
      const geometry = new THREE.BoxGeometry(0.035, 0.035, 0.035);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(point).addScaledVector(normal, 0.03);
      this.scene.add(particle);
      const velocity = normal
        .clone()
        .multiplyScalar(1.2 + Math.random() * 2)
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.8, Math.random() * 1.4, (Math.random() - 0.5) * 1.8));
      this.effects.push({ object: particle, life: 0.28, maxLife: 0.28, velocity, material });
    }
  }
}
