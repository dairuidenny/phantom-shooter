export class InputController {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseButtons = 0;
  private mouseButtonsPressed = 0;
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  constructor(private readonly lockElement: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.lockElement;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isMouseDown(button: number): boolean {
    return (this.mouseButtons & (1 << button)) !== 0;
  }

  wasMousePressed(button: number): boolean {
    return (this.mouseButtonsPressed & (1 << button)) !== 0;
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseButtonsPressed = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.reset);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.code)) {
      this.pressed.add(event.code);
    }
    this.keys.add(event.code);

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const mask = 1 << event.button;
    if ((this.mouseButtons & mask) === 0) this.mouseButtonsPressed |= mask;
    this.mouseButtons |= mask;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.mouseButtons &= ~(1 << event.button);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked) return;
    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.reset();
  };

  private readonly reset = (): void => {
    this.keys.clear();
    this.pressed.clear();
    this.mouseButtons = 0;
    this.mouseButtonsPressed = 0;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  };
}
