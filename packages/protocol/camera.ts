// Preview traffic is independent of combat inputs and never enters snapshots.
export type HandPoint = { x: number; y: number };
export type CameraFrame = {
  protocolVersion: 1;
  sessionId: string;
  generation: number;
  image?: string;
  hands?: HandPoint[][];
};
export function validCameraFrame(v: any): v is CameraFrame {
  return !!v && v.protocolVersion === 1 && typeof v.sessionId === "string" &&
    Number.isSafeInteger(v.generation) &&
    Object.keys(v).every(k => ["protocolVersion", "sessionId", "generation", "image", "hands"].includes(k)) &&
    (v.image !== undefined || v.hands !== undefined) &&
    (v.image === undefined || (typeof v.image === "string" && v.image.length <= 48000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.image))) &&
    (v.hands === undefined || (Array.isArray(v.hands) && v.hands.length <= 2 && v.hands.every((hand: any) =>
      Array.isArray(hand) && hand.length === 21 && hand.every((p: any) => p &&
        Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 &&
        Object.keys(p).every(k => k === "x" || k === "y")))));
}
