/**
 * A normalized 3D landmark.
 * All coordinates are normalized (0–1) unless otherwise specified.
 */
export interface Landmark {
  id: number;

  name: string;

  x: number;

  y: number;

  z: number;

  visibility: number;

  presence?: number;
}