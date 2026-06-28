import { Landmark } from "./Landmark";
import { MotionFrame } from "./MotionFrame";
import { Metrics } from "./Metrics";
import { GestureType } from "./Gesture";

export interface VisionFrame {

    timestamp:number;

    frameNumber:number;

    landmarks: Landmark[];

    motion: MotionFrame[];

    gestures: GestureType[];

    metrics: Metrics;

    confidence:number;

}