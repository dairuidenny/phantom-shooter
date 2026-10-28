const TUTORIAL_HINTS = [
  'E键开始录制分身',
  '最多可同时录制三个分身',
  '充能完成，Q键引爆所有分身',
  '按住F键进入子弹时间',
  '瞄准分身，松开F键突进，对沿途造成伤害',
] as const;

export interface TrainingTutorialSnapshot {
  isRecording: boolean;
  echoCount: number;
  detonationReady: boolean;
  bulletTimeActive: boolean;
  isDashing: boolean;
}

export class TrainingTutorialController {
  private elapsed = 0;
  private step = 0;
  private visibleStep: number | null = null;
  private recordingStartCount = 0;
  private firstRecordingEndedAt: number | null = null;
  private hasDetonated = false;
  private hasEnteredBulletTime = false;
  private hasDashed = false;
  private previous: TrainingTutorialSnapshot = {
    isRecording: false,
    echoCount: 0,
    detonationReady: false,
    bulletTimeActive: false,
    isDashing: false,
  };

  constructor(private readonly element: HTMLElement) {
    this.element.classList.remove('visible');
    this.element.textContent = '';
  }

  update(deltaSeconds: number, state: TrainingTutorialSnapshot): void {
    this.elapsed += deltaSeconds;

    const recordingStarted = state.isRecording && !this.previous.isRecording;
    const recordingEnded = !state.isRecording && this.previous.isRecording;
    const detonationTriggered =
      this.previous.detonationReady &&
      !state.detonationReady &&
      this.previous.echoCount > 0 &&
      state.echoCount === 0;
    const bulletTimeStarted = state.bulletTimeActive && !this.previous.bulletTimeActive;
    const bulletTimeEnded = !state.bulletTimeActive && this.previous.bulletTimeActive;
    const dashStarted = state.isDashing && !this.previous.isDashing;

    if (recordingStarted) this.recordingStartCount += 1;
    if (recordingEnded && this.firstRecordingEndedAt === null) {
      this.firstRecordingEndedAt = this.elapsed;
    }
    if (detonationTriggered) this.hasDetonated = true;
    if (bulletTimeStarted) this.hasEnteredBulletTime = true;
    if (dashStarted) this.hasDashed = true;

    if (this.visibleStep !== null) {
      const completed =
        (this.visibleStep === 0 && recordingStarted) ||
        (this.visibleStep === 1 && recordingStarted && this.recordingStartCount >= 2) ||
        (this.visibleStep === 2 && detonationTriggered) ||
        (this.visibleStep === 3 && bulletTimeStarted) ||
        (this.visibleStep === 4 && dashStarted);
      if (completed) {
        this.completeStep();
        this.previous = { ...state };
        return;
      }

      // The dash hint repeats on each bullet-time activation until a dash succeeds.
      if (this.visibleStep === 4 && bulletTimeEnded) this.hide();
      this.previous = { ...state };
      return;
    }

    switch (this.step) {
      case 0:
        if (this.elapsed >= 5) {
          if (this.recordingStartCount > 0) this.completeStep();
          else this.show(0);
        }
        break;
      case 1:
        if (
          this.firstRecordingEndedAt !== null &&
          this.elapsed - this.firstRecordingEndedAt >= 5
        ) {
          if (this.recordingStartCount >= 2) this.completeStep();
          else this.show(1);
        }
        break;
      case 2:
        if (this.hasDetonated) this.completeStep();
        else if (state.detonationReady && state.echoCount === 3) this.show(2);
        break;
      case 3:
        if (this.hasEnteredBulletTime) this.completeStep();
        else if (state.echoCount > 0) this.show(3);
        break;
      case 4:
        if (this.hasDashed) this.completeStep();
        else if (state.bulletTimeActive) this.show(4);
        break;
    }

    this.previous = { ...state };
  }

  private show(step: number): void {
    this.visibleStep = step;
    this.element.classList.remove('visible');
    this.element.textContent = TUTORIAL_HINTS[step];
    void this.element.offsetWidth;
    this.element.classList.add('visible');
  }

  private hide(): void {
    this.visibleStep = null;
    this.element.classList.remove('visible');
  }

  private completeStep(): void {
    this.hide();
    this.step += 1;
  }
}
