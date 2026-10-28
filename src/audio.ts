export class GameAudio {
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
  }

  shot(lockBoltOpen = false): void {
    const context = this.getContext();
    const now = context.currentTime;
    const output = context.createGain();
    output.gain.setValueAtTime(0.24, now);
    output.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    output.connect(context.destination);

    const noise = context.createBufferSource();
    noise.buffer = this.getNoiseBuffer(context);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 0.7;
    noise.connect(filter).connect(output);
    noise.start(now);
    noise.stop(now + 0.12);

    const punch = context.createOscillator();
    const punchGain = context.createGain();
    punch.type = 'square';
    punch.frequency.setValueAtTime(150, now);
    punch.frequency.exponentialRampToValueAtTime(55, now + 0.07);
    punchGain.gain.setValueAtTime(0.16, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    punch.connect(punchGain).connect(context.destination);
    punch.start(now);
    punch.stop(now + 0.08);

    if (lockBoltOpen) {
      // A bright metallic snap followed by a lower clack makes the empty magazine audible.
      this.click(1250, 0.025, 0.05, 0.09);
      this.click(320, 0.07, 0.082, 0.075);
    }
  }

  reload(): void {
    this.click(260, 0.04, 0);
    this.click(420, 0.035, 0.16);
    this.click(620, 0.025, 0.35);
  }

  dryFire(): void {
    this.click(120, 0.035, 0);
  }

  echoShot(): void {
    const context = this.getContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.09);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
    this.click(980, 0.018, 0.015, 0.045);
  }

  echoReload(): void {
    this.click(520, 0.025, 0, 0.035);
    this.click(760, 0.02, 0.16, 0.035);
    this.click(980, 0.018, 0.35, 0.035);
  }

  echoExplosion(delay = 0): void {
    const context = this.getContext();
    if (context.state === 'suspended') void context.resume();
    const start = context.currentTime + delay;

    // Keep the body above sub-bass so laptop speakers and ordinary headphones reproduce it.
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(128, start);
    oscillator.frequency.exponentialRampToValueAtTime(38, start + 0.55);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.24, start + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.62);

    const impact = context.createOscillator();
    const impactGain = context.createGain();
    impact.type = 'triangle';
    impact.frequency.setValueAtTime(210, start);
    impact.frequency.exponentialRampToValueAtTime(72, start + 0.2);
    impactGain.gain.setValueAtTime(0.001, start);
    impactGain.gain.linearRampToValueAtTime(0.12, start + 0.01);
    impactGain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
    impact.connect(impactGain).connect(context.destination);
    impact.start(start);
    impact.stop(start + 0.25);

    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(62, start);
    sub.frequency.exponentialRampToValueAtTime(27, start + 0.48);
    subGain.gain.setValueAtTime(0.001, start);
    subGain.gain.linearRampToValueAtTime(0.13, start + 0.025);
    subGain.gain.exponentialRampToValueAtTime(0.001, start + 0.52);
    sub.connect(subGain).connect(context.destination);
    sub.start(start);
    sub.stop(start + 0.54);

    const noise = context.createBufferSource();
    noise.buffer = this.getNoiseBuffer(context);
    const lowPass = context.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(720, start);
    lowPass.frequency.exponentialRampToValueAtTime(180, start + 0.32);
    lowPass.Q.value = 0.65;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.001, start);
    noiseGain.gain.linearRampToValueAtTime(0.14, start + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
    noise.connect(lowPass).connect(noiseGain).connect(context.destination);
    noise.start(start);
    noise.stop(start + 0.4);
  }

  hit(): void {
    const context = this.getContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(860, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.045);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
  }

  private click(frequency: number, duration: number, delay: number, volume = 0.04): void {
    const context = this.getContext();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  private getContext(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    return this.context;
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(context.sampleRate * 0.65);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}
