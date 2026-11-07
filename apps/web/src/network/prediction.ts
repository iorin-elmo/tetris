import { step, type GameState, type Input } from '../../../../packages/engine/src/index';
import type { MatchFrame, InputFrame } from '../../../../packages/protocol/src/index';

// Keep the prediction inside the server's allowed future-input window, even
// after a suspended tab or a clock correction. Input delay is included in this.
export const MAX_PREDICTION_TICKS = 24;

export class Prediction {
  inputs: InputFrame[] = [];
  outbound: InputFrame[] = [];
  nextSeq = 0;
  frame: MatchFrame | null = null;
  state: GameState | null = null;
  private koTick: number | null = null;
  private predictedDead = false;

  get alive() {
    return !!this.frame?.self?.alive && this.koTick === null;
  }

  clear() {
    this.inputs = [];
    this.outbound = [];
  }

  reconcile(frame: MatchFrame, targetTick: number, reset = false): boolean {
    const differentMatch = this.frame?.matchId !== frame.matchId;
    if (!differentMatch && !reset && this.frame && frame.tick < this.frame.tick) return false;
    if (differentMatch || reset) {
      this.clear();
      this.nextSeq = (frame.receivedSeq ?? frame.ackSeq) + 1;
      if (differentMatch) this.koTick = null;
    }
    this.frame = frame;
    this.inputs = this.inputs.filter((f) => f.seq > frame.ackSeq);
    if (!frame.self?.alive) this.clear();
    this.predict(targetTick);
    return true;
  }

  queue(tick: number, input: Input) {
    if (!this.alive || !this.frame) return;
    if (tick <= this.frame.tick || tick > this.frame.tick + MAX_PREDICTION_TICKS) return;
    // A speculative top-out must not show KO, resurrect, or keep issuing drops.
    // Neutral frames still reach the authority while its result is pending.
    const frame = { tick, seq: this.nextSeq++, input: this.predictedDead ? {} : input };
    this.inputs.push(frame);
    this.outbound.push(frame);
    this.predict(tick);
  }

  confirmKO(tick: number) {
    this.koTick = tick;
    this.clear();
    if (this.state) this.state = { ...this.state, alive: false, active: null };
  }

  private predict(targetTick: number) {
    const frame = this.frame;
    if (!frame?.self) {
      this.state = null;
      return;
    }
    if (!frame.self.alive || this.koTick !== null) {
      this.state = { ...frame.self, alive: false };
      return;
    }
    const received = frame.receivedSeq ?? frame.ackSeq;
    const scheduled = (frame.pendingInputs ?? []).map((f) => ({ ...f }));
    let lastTick = scheduled.at(-1)?.tick ?? frame.tick;
    for (const f of this.inputs) {
      if (f.seq <= received) continue;
      lastTick = Math.max(lastTick + 1, f.tick, frame.tick + 1);
      scheduled.push({ ...f, tick: lastTick });
    }
    let state = frame.self;
    let lastAlive = state;
    let held: Input = frame.heldInput ?? { left: state.horizontal.left, right: state.horizontal.right };
    let index = 0;
    const end = Math.min(Math.max(frame.tick, targetTick), frame.tick + MAX_PREDICTION_TICKS);
    const rules = frame.selfRules ?? frame.rules;
    this.predictedDead = false;
    // Run every tick, including gaps without input. Garbage arrival is measured
    // in these ticks, not in the number of unacknowledged input frames.
    for (let tick = frame.tick + 1; tick <= end; tick++) {
      const next = scheduled[index]?.tick <= tick ? scheduled[index++] : undefined;
      const input = next?.input ?? held;
      if (next) held = { left: input.left, right: input.right, soft: input.soft };
      const result = step(state, input, rules).state;
      if (!result.alive) {
        this.predictedDead = true;
        break;
      }
      lastAlive = state = result;
    }
    this.state = lastAlive;
  }
}
