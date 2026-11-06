let context: AudioContext | undefined;
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    /* silent browsers still play */
  }
}
export function sound(kind: 'lock' | 'clear' | 'hold' | 'end', volume: number) {
  if (!volume || !context || context.state !== 'running') return;
  const now = context.currentTime,
    o = context.createOscillator(),
    g = context.createGain();
  o.type = kind === 'clear' ? 'sine' : 'triangle';
  o.frequency.setValueAtTime(
    kind === 'clear' ? 660 : kind === 'hold' ? 440 : kind === 'end' ? 220 : 130,
    now,
  );
  o.frequency.exponentialRampToValueAtTime(kind === 'clear' ? 990 : 60, now + 0.1);
  g.gain.setValueAtTime(volume * 0.12, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  o.connect(g);
  g.connect(context.destination);
  o.start(now);
  o.stop(now + 0.16);
}
