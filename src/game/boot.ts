/** The start message of `index.html` ("Game is loading…" with a bar): tell it how far the start is, take it down when the game can show its own screens. */
interface BootMessage {
  set(fraction: number): void;
  done(): void;
}

const message = (): BootMessage | undefined => (window as unknown as { __boot?: BootMessage }).__boot;

export function bootProgress(fraction: number): void {
  message()?.set(fraction);
}

export function bootDone(): void {
  message()?.done();
}
