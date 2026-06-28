export class FrameBuffer<T> {
    private frames: T[] = [];

    constructor(
        private readonly maxSize: number
    ) {}

    push(frame: T): void {
        this.frames.push(frame);

        if (this.frames.length > this.maxSize) {
            this.frames.shift();
        }
    }

    latest(): T | undefined {
        return this.frames[this.frames.length - 1];
    }

    previous(): T | undefined {
        return this.frames[this.frames.length - 2];
    }

    get(index: number): T | undefined {
        return this.frames[index];
    }

    clear(): void {
        this.frames.length = 0;
    }

    size(): number {
        return this.frames.length;
    }

    isFull(): boolean {
        return this.frames.length === this.maxSize;
    }

    getFrames(): readonly T[] {
        return this.frames;
    }
}