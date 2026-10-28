import { GAME_CONFIG } from './config';
import { InputController } from './input';

export interface BulletTimeUpdate {
  ended: boolean;
}

export class BulletTimeController {
  private active = false;
  private elapsed = 0;
  private cooldownRemaining = 0;

  constructor(private readonly input: InputController) {}

  get isActive(): boolean {
    return this.active;
  }

  get isReady(): boolean {
    return !this.active && this.cooldownRemaining <= 0;
  }

  get timeScale(): number {
    return this.active ? GAME_CONFIG.bulletTime.timeScale : 1;
  }

  get remainingProgress(): number {
    if (!this.active) return 0;
    return 1 - this.elapsed / GAME_CONFIG.bulletTime.maxDurationSeconds;
  }

  get cooldownProgress(): number {
    if (this.cooldownRemaining <= 0) return 1;
    return 1 - this.cooldownRemaining / GAME_CONFIG.bulletTime.cooldownSeconds;
  }

  update(realDeltaSeconds: number, canActivate: boolean): BulletTimeUpdate {
    if (!this.active) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - realDeltaSeconds);
      if (
        canActivate &&
        this.cooldownRemaining <= 0 &&
        this.input.wasPressed('KeyF')
      ) {
        this.active = true;
        this.elapsed = 0;
      }
    }

    if (!this.active) return { ended: false };

    this.elapsed = Math.min(
      GAME_CONFIG.bulletTime.maxDurationSeconds,
      this.elapsed + realDeltaSeconds,
    );
    if (
      this.input.isDown('KeyF') &&
      this.elapsed < GAME_CONFIG.bulletTime.maxDurationSeconds
    ) {
      return { ended: false };
    }

    this.end();
    return { ended: true };
  }

  cancel(): void {
    if (this.active) this.end();
  }

  private end(): void {
    this.active = false;
    this.elapsed = 0;
    this.cooldownRemaining = GAME_CONFIG.bulletTime.cooldownSeconds;
  }
}
