import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { GameAudio } from './audio';
import { BulletTimeController } from './bullet-time';
import { GAME_CONFIG } from './config';
import { EchoSystem } from './echo';
import { InputController } from './input';
import { LEVELS, type LevelId } from './levels';
import { PlayerController } from './player';
import { TrainingTutorialController } from './tutorial';
import { RifleController } from './weapon';
import { TrainingWorld } from './world';

interface HudElements {
  menuOverlay: HTMLElement;
  menuTitle: HTMLElement;
  resumeButton: HTMLButtonElement;
  failureOverlay: HTMLElement;
  retryButton: HTMLButtonElement;
  victoryOverlay: HTMLElement;
  victoryRetryButton: HTMLButtonElement;
  levelName: HTMLElement;
  ammo: HTMLElement;
  ammoState: HTMLElement;
  stats: HTMLElement;
  sprint: HTMLElement;
  crosshair: HTMLElement;
  recordingFrame: HTMLElement;
  recordingRingContainer: SVGSVGElement;
  recordingRing: SVGCircleElement;
  bulletTimeVignette: HTMLElement;
  bulletTimeRingContainer: SVGSVGElement;
  bulletTimeRing: SVGCircleElement;
  dashSpeedLines: HTMLElement;
  bulletTimeAbility: HTMLElement;
  bulletTimeAbilityFill: HTMLElement;
  tutorialHint: HTMLElement;
  echoSlots: HTMLElement[];
  detonationCharge: HTMLElement;
  detonationChargeFill: HTMLElement;
  detonationChargeValue: HTMLElement;
  waveStatus: HTMLElement;
  waveSummary: HTMLElement;
  waveCountdown: HTMLElement;
  waveNumber: HTMLElement;
  enemyCount: HTMLElement;
  baseHealth: HTMLElement;
  baseHealthFill: HTMLElement;
  baseHealthValue: HTMLElement;
}

interface GameSession {
  levelId: LevelId;
  physicsWorld: RAPIER.World;
  world: TrainingWorld;
  player: PlayerController;
  echoSystem: EchoSystem;
  bulletTime: BulletTimeController;
  tutorial: TrainingTutorialController | null;
  rifle: RifleController;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function levelCardsMarkup(): string {
  return LEVELS.map(
    (level) => `
      <button class="level-card" type="button" data-level="${level.id}">
        <span class="level-preview level-preview-${level.id}" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i>
        </span>
        <span class="level-card-copy">
          <strong>${level.name}</strong>
          <small>${level.subtitle}</small>
        </span>
      </button>`,
  ).join('');
}

function buildHud(): HudElements {
  const levelCards = levelCardsMarkup();
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main id="game-shell">
      <div id="viewport"></div>
      <section id="menu-overlay" class="overlay visible">
        <div class="panel menu-panel">
          <div class="eyebrow">PHANTOM SHOOTER // MISSION SELECT</div>
          <h1 id="menu-title">选择<br /><span>关卡</span></h1>
          <p>选择场景并立即部署。按 Esc 可在游戏中暂停并切换关卡。</p>
          <button id="resume-button" class="resume-button hidden" type="button">继续当前关卡</button>
          <div class="level-grid">${levelCards}</div>
          <div class="control-grid compact">
            <div><kbd>WASD</kbd><span>移动</span></div>
            <div><kbd>LMB</kbd><span>射击</span></div>
            <div><kbd>E / F</kbd><span>录制 / 子弹时间</span></div>
          </div>
          <small>点击关卡卡片开始 · ESC 暂停</small>
        </div>
      </section>
      <section id="failure-overlay" class="overlay failure-overlay">
        <div class="panel failure-panel">
          <div class="eyebrow">MISSION STATUS // DEFENSE COLLAPSED</div>
          <h1>防守<br /><span>失败</span></h1>
          <p>方尖碑已被摧毁。重新部署，或选择其他关卡。</p>
          <button id="retry-button" type="button">重新挑战</button>
          <div class="level-grid result-level-grid">${levelCards}</div>
        </div>
      </section>
      <section id="victory-overlay" class="overlay victory-overlay">
        <div class="panel victory-panel">
          <div class="eyebrow">MISSION STATUS // DEFENSE SECURED</div>
          <h1>防守<br /><span>胜利</span></h1>
          <p>所有配置波次均已肃清。重新挑战，或选择其他关卡。</p>
          <button id="victory-retry-button" type="button">重新挑战</button>
          <div class="level-grid result-level-grid">${levelCards}</div>
        </div>
      </section>
      <div id="hud" aria-hidden="true">
        <div class="top-mark"><span>PHANTOM SHOOTER</span><i></i><span id="level-name">热身靶场</span></div>
        <div id="wave-status" class="wave-status">
          <div id="wave-summary" class="wave-summary">
            <strong>第 <span id="wave-number">1</span> 波</strong>
            <span>剩余敌人 <b id="enemy-count">30</b></span>
          </div>
          <strong id="wave-countdown" class="wave-countdown hidden">下一波5秒后到达</strong>
        </div>
        <div id="recording-frame" class="recording-frame"></div>
        <div id="bullet-time-vignette" class="bullet-time-vignette"></div>
        <div id="dash-speed-lines" class="dash-speed-lines"></div>
        <svg id="recording-ring" class="recording-ring" viewBox="0 0 72 72">
          <circle class="recording-ring-track" cx="36" cy="36" r="30"></circle>
          <circle id="recording-ring-progress" class="recording-ring-progress" cx="36" cy="36" r="30" pathLength="100"></circle>
        </svg>
        <svg id="bullet-time-ring" class="bullet-time-ring" viewBox="0 0 88 88">
          <circle class="bullet-time-ring-track" cx="44" cy="44" r="38"></circle>
          <circle id="bullet-time-ring-progress" class="bullet-time-ring-progress" cx="44" cy="44" r="38" pathLength="100"></circle>
        </svg>
        <div id="tutorial-hint" class="tutorial-hint"></div>
        <div id="echo-slots" class="echo-slots"><i></i><i></i><i></i></div>
        <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i></div>
        <div class="status left-status">
          <span class="label">LOCOMOTION</span>
          <strong id="sprint-state">READY</strong>
        </div>
        <div class="status accuracy">
          <span class="label">TARGET DATA</span>
          <strong id="stats">0 HIT / 0 SHOT</strong>
        </div>
        <div id="base-health" class="base-health">
          <div><span>方尖碑完整度</span><strong id="base-health-value">1000 / 1000</strong></div>
          <i><b id="base-health-fill"></b></i>
        </div>
        <div id="bullet-time-ability" class="bullet-time-ability ready">
          <span>子弹时间</span>
          <kbd><i id="bullet-time-ability-fill"></i><b>F</b></kbd>
        </div>
        <div id="detonation-charge" class="detonation-charge">
          <kbd>Q</kbd>
          <div>
            <span><b>虚影引爆</b><em id="detonation-charge-value">0 / 200</em></span>
            <i class="detonation-charge-track"><b id="detonation-charge-fill"></b></i>
          </div>
        </div>
        <div class="ammo-block">
          <span id="ammo-state" class="label">RIFLE // AUTO</span>
          <div><strong id="ammo">30</strong><span>∞</span></div>
        </div>
        <div class="controls-hint">WASD MOVE · SHIFT SPRINT · SPACE JUMP · RMB ADS · R RELOAD · E RECORD · HOLD F BULLET TIME / RELEASE DASH · Q DETONATE</div>
      </div>
      <div class="scanlines"></div>
    </main>
  `;

  return {
    menuOverlay: requireElement('#menu-overlay'),
    menuTitle: requireElement('#menu-title'),
    resumeButton: requireElement<HTMLButtonElement>('#resume-button'),
    failureOverlay: requireElement('#failure-overlay'),
    retryButton: requireElement<HTMLButtonElement>('#retry-button'),
    victoryOverlay: requireElement('#victory-overlay'),
    victoryRetryButton: requireElement<HTMLButtonElement>('#victory-retry-button'),
    levelName: requireElement('#level-name'),
    ammo: requireElement('#ammo'),
    ammoState: requireElement('#ammo-state'),
    stats: requireElement('#stats'),
    sprint: requireElement('#sprint-state'),
    crosshair: requireElement('#crosshair'),
    recordingFrame: requireElement('#recording-frame'),
    recordingRingContainer: requireElement<SVGSVGElement>('#recording-ring'),
    recordingRing: requireElement<SVGCircleElement>('#recording-ring-progress'),
    bulletTimeVignette: requireElement('#bullet-time-vignette'),
    bulletTimeRingContainer: requireElement<SVGSVGElement>('#bullet-time-ring'),
    bulletTimeRing: requireElement<SVGCircleElement>('#bullet-time-ring-progress'),
    dashSpeedLines: requireElement('#dash-speed-lines'),
    bulletTimeAbility: requireElement('#bullet-time-ability'),
    bulletTimeAbilityFill: requireElement('#bullet-time-ability-fill'),
    tutorialHint: requireElement('#tutorial-hint'),
    echoSlots: Array.from(document.querySelectorAll<HTMLElement>('#echo-slots i')),
    detonationCharge: requireElement('#detonation-charge'),
    detonationChargeFill: requireElement('#detonation-charge-fill'),
    detonationChargeValue: requireElement('#detonation-charge-value'),
    waveStatus: requireElement('#wave-status'),
    waveSummary: requireElement('#wave-summary'),
    waveCountdown: requireElement('#wave-countdown'),
    waveNumber: requireElement('#wave-number'),
    enemyCount: requireElement('#enemy-count'),
    baseHealth: requireElement('#base-health'),
    baseHealthFill: requireElement('#base-health-fill'),
    baseHealthValue: requireElement('#base-health-value'),
  };
}

async function main(): Promise<void> {
  const hud = buildHud();
  const viewport = requireElement<HTMLDivElement>('#viewport');
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    GAME_CONFIG.camera.hipFov,
    window.innerWidth / window.innerHeight,
    0.03,
    150,
  );
  const input = new InputController(renderer.domElement);
  const audio = new GameAudio();
  let session: GameSession;
  let hasStarted = false;
  let failureVisible = false;
  let victoryVisible = false;
  let wasRecording = false;
  let previousBaseHealthFraction = 1;
  let baseHealthShakeCooldown = 0;
  let baseHealthShakeQueued = false;

  const triggerBaseHealthShake = (): void => {
    hud.baseHealth.classList.remove('hit');
    void hud.baseHealth.offsetWidth;
    hud.baseHealth.classList.add('hit');
    // The CSS shake lasts 380ms; the remaining 500ms is an enforced quiet interval.
    baseHealthShakeCooldown = 0.88;
    baseHealthShakeQueued = false;
  };

  const updateSelectedCards = (levelId: LevelId): void => {
    document.querySelectorAll<HTMLElement>('[data-level]').forEach((card) => {
      card.classList.toggle('selected', card.dataset.level === levelId);
    });
  };

  const resetSessionHud = (): void => {
    hud.recordingFrame.classList.remove('active');
    hud.recordingRingContainer.classList.remove('active', 'exiting');
    hud.recordingRing.style.strokeDashoffset = '0';
    hud.bulletTimeVignette.classList.remove('active');
    hud.bulletTimeRingContainer.classList.remove('active');
    hud.bulletTimeRing.style.strokeDashoffset = '0';
    hud.dashSpeedLines.classList.remove('active');
    hud.tutorialHint.classList.remove('visible');
    hud.tutorialHint.textContent = '';
  };

  const createSession = (levelId: LevelId): void => {
    if (session) {
      session.rifle.dispose();
      session.echoSystem.dispose();
      camera.removeFromParent();
      session.world.dispose();
      session.physicsWorld.free();
    }

    camera.fov = GAME_CONFIG.camera.hipFov;
    camera.updateProjectionMatrix();
    const physicsWorld = new RAPIER.World({ x: 0, y: -GAME_CONFIG.player.gravity, z: 0 });
    const world = new TrainingWorld(physicsWorld, levelId);
    world.scene.add(camera);
    const playerSpawn = levelId === 'spire'
      ? new THREE.Vector3(0, 1.05, 5)
      : new THREE.Vector3(0, 1.05, 14);
    const player = new PlayerController(camera, physicsWorld, input, playerSpawn);
    const echoSystem = new EchoSystem(input, player, world, audio);
    const bulletTime = new BulletTimeController(input);
    const tutorial = levelId === 'training'
      ? new TrainingTutorialController(hud.tutorialHint)
      : null;
    const rifle = new RifleController(camera, input, player, world, audio, echoSystem);
    session = { levelId, physicsWorld, world, player, echoSystem, bulletTime, tutorial, rifle };
    failureVisible = false;
    victoryVisible = false;
    wasRecording = false;
    previousBaseHealthFraction = world.baseHealthFraction;
    baseHealthShakeCooldown = 0;
    baseHealthShakeQueued = false;
    resetSessionHud();
    hud.baseHealth.classList.remove('hit');
    hud.failureOverlay.classList.remove('visible');
    hud.victoryOverlay.classList.remove('visible');
    updateSelectedCards(levelId);
  };

  createSession('training');

  const requestPlay = async (): Promise<void> => {
    await audio.resume();
    renderer.domElement.requestPointerLock();
  };

  const startLevel = async (levelId: LevelId): Promise<void> => {
    createSession(levelId);
    hasStarted = true;
    hud.menuOverlay.classList.remove('visible');
    await requestPlay();
  };

  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((button) => {
    button.addEventListener('click', () => {
      const levelId = button.dataset.level as LevelId;
      void startLevel(levelId);
    });
  });
  hud.resumeButton.addEventListener('click', () => void requestPlay());
  hud.retryButton.addEventListener('click', () => void startLevel(session.levelId));
  hud.victoryRetryButton.addEventListener('click', () => void startLevel(session.levelId));
  renderer.domElement.addEventListener('click', () => {
    if (hasStarted && !failureVisible && !victoryVisible && !input.isLocked) void requestPlay();
  });
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    if (input.isLocked) {
      hud.menuOverlay.classList.remove('visible');
      return;
    }
    if (failureVisible || victoryVisible) return;
    hud.menuOverlay.classList.add('visible');
    hud.menuTitle.innerHTML = hasStarted ? '任务<br /><span>暂停</span>' : '选择<br /><span>关卡</span>';
    hud.resumeButton.classList.toggle('hidden', !hasStarted);
  });

  const resize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', resize);

  let lastTime = performance.now();
  const animate = (time: number): void => {
    const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    const { world, player, physicsWorld, echoSystem, bulletTime, tutorial, rifle } = session;
    const active = input.isLocked && !failureVisible && !victoryVisible;

    if (active) {
      const bulletTimeUpdate = bulletTime.update(
        deltaSeconds,
        !echoSystem.isRecording && !echoSystem.isReplacing,
      );
      echoSystem.setBulletTimeActive(bulletTime.isActive);
      const gameplayDeltaSeconds = deltaSeconds * bulletTime.timeScale;
      world.update(gameplayDeltaSeconds);
      player.update(gameplayDeltaSeconds, rifle.adsAmount);
      physicsWorld.timestep = gameplayDeltaSeconds;
      physicsWorld.step();
      player.syncCamera(gameplayDeltaSeconds);
      world.scene.updateMatrixWorld(true);
      echoSystem.update(
        gameplayDeltaSeconds,
        true,
        rifle.adsAmount,
        !bulletTime.isActive && !bulletTimeUpdate.ended,
      );
      if (bulletTimeUpdate.ended) echoSystem.beginTargetedReplacement();
      rifle.update(gameplayDeltaSeconds, !echoSystem.isReplacing);
      tutorial?.update(deltaSeconds, {
        isRecording: echoSystem.isRecording,
        echoCount: echoSystem.slotStates.filter(Boolean).length,
        detonationReady: echoSystem.isDetonationReady,
        bulletTimeActive: bulletTime.isActive,
        isDashing: echoSystem.isReplacing,
      });
    } else {
      bulletTime.cancel();
      echoSystem.setBulletTimeActive(false);
      world.scene.updateMatrixWorld(true);
    }

    if (world.isFailed && !failureVisible) {
      failureVisible = true;
      bulletTime.cancel();
      echoSystem.setBulletTimeActive(false);
      if (input.isLocked) document.exitPointerLock();
      hud.menuOverlay.classList.remove('visible');
      hud.failureOverlay.classList.add('visible');
    } else if (world.isCompleted && !victoryVisible) {
      victoryVisible = true;
      bulletTime.cancel();
      echoSystem.setBulletTimeActive(false);
      if (input.isLocked) document.exitPointerLock();
      hud.menuOverlay.classList.remove('visible');
      hud.victoryOverlay.classList.add('visible');
    }

    const level = LEVELS.find((candidate) => candidate.id === session.levelId)!;
    const accuracy = world.getAccuracy();
    hud.levelName.textContent = level.name;
    hud.ammo.textContent = rifle.ammoInMagazine.toString().padStart(2, '0');
    hud.ammoState.textContent = rifle.isReloading ? 'RELOADING' : 'RIFLE // AUTO';
    hud.ammo.classList.toggle('low', rifle.ammoInMagazine <= 6);
    hud.crosshair.style.setProperty('--ads', rifle.adsAmount.toFixed(3));
    hud.crosshair.style.setProperty('--spread', rifle.crosshairSpread.toFixed(3));
    const isRecording = echoSystem.isRecording;
    hud.recordingFrame.classList.toggle('active', isRecording);
    if (isRecording && !wasRecording) {
      hud.recordingRingContainer.classList.remove('exiting');
      void hud.recordingRingContainer.getBoundingClientRect();
      hud.recordingRingContainer.classList.add('active');
    } else if (!isRecording && wasRecording) {
      hud.recordingRingContainer.classList.remove('active', 'exiting');
      void hud.recordingRingContainer.getBoundingClientRect();
      hud.recordingRingContainer.classList.add('exiting');
    }
    if (isRecording) {
      hud.recordingRing.style.strokeDashoffset = `${echoSystem.recordingProgress * 100}`;
    }
    wasRecording = isRecording;
    const isBulletTimeActive = bulletTime.isActive;
    const isBulletTimeReady = bulletTime.isReady && !isRecording && !echoSystem.isReplacing;
    hud.bulletTimeVignette.classList.toggle('active', isBulletTimeActive);
    hud.bulletTimeRingContainer.classList.toggle('active', isBulletTimeActive);
    hud.bulletTimeRing.style.strokeDashoffset = `${(1 - bulletTime.remainingProgress) * 100}`;
    hud.dashSpeedLines.classList.toggle('active', echoSystem.isReplacing);
    hud.bulletTimeAbilityFill.style.height = `${bulletTime.cooldownProgress * 100}%`;
    hud.bulletTimeAbility.classList.toggle('ready', isBulletTimeReady);
    hud.bulletTimeAbility.classList.toggle('active', isBulletTimeActive);
    hud.bulletTimeAbility.classList.toggle('blocked', isRecording || echoSystem.isReplacing);
    const slotStates = echoSystem.slotStates;
    hud.echoSlots.forEach((slot, index) => slot.classList.toggle('active', slotStates[index]));
    hud.detonationChargeFill.style.width = `${echoSystem.detonationChargeProgress * 100}%`;
    hud.detonationChargeValue.textContent = `${echoSystem.detonationChargeAmount} / ${GAME_CONFIG.echo.detonationChargeRequired}`;
    hud.detonationCharge.classList.toggle('ready', echoSystem.isDetonationReady);
    hud.stats.textContent = `${accuracy.hits} HIT / ${accuracy.shots} SHOT`;
    hud.sprint.textContent = echoSystem.isReplacing
      ? 'DASH'
      : input.isDown('ShiftLeft') || input.isDown('ShiftRight')
        ? 'SPRINT'
        : 'READY';

    hud.waveStatus.classList.toggle('visible', world.hasDefenseObjective);
    hud.baseHealth.classList.toggle('visible', world.hasDefenseObjective);
    if (world.hasDefenseObjective) {
      const betweenWaves = world.isBetweenWaves;
      hud.waveSummary.classList.toggle('hidden', betweenWaves);
      hud.waveCountdown.classList.toggle('hidden', !betweenWaves);
      if (betweenWaves) {
        hud.waveCountdown.textContent = `下一波${world.nextWaveSeconds}秒后到达`;
      }
      hud.waveNumber.textContent = world.currentWave.toString();
      hud.enemyCount.textContent = world.remainingEnemyCount.toString();
      const currentBaseHealthFraction = world.baseHealthFraction;
      baseHealthShakeCooldown = Math.max(0, baseHealthShakeCooldown - deltaSeconds);
      if (currentBaseHealthFraction < previousBaseHealthFraction) {
        baseHealthShakeQueued = true;
      }
      if (baseHealthShakeQueued && baseHealthShakeCooldown <= 0) {
        triggerBaseHealthShake();
      }
      previousBaseHealthFraction = currentBaseHealthFraction;
      hud.baseHealthFill.style.width = `${world.baseHealthFraction * 100}%`;
      hud.baseHealthFill.classList.toggle('critical', world.baseHealthFraction <= 0.3);
      hud.baseHealthValue.textContent = `${world.baseHealth} / ${GAME_CONFIG.defense.towerMaxHealth}`;
    }

    renderer.render(world.scene, camera);
    input.endFrame();
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

void main().catch((error: unknown) => {
  console.error(error);
  document.body.innerHTML = `<pre class="fatal-error">Prototype failed to start:\n${String(error)}</pre>`;
});
