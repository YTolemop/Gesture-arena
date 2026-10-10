export const LABELS = [
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "JUMP",
  "CROUCH",
  "BLOCK",
  "NORMAL_ATTACK",
  "ATTACK_SKILL",
  "DEFENSE_SKILL",
  "CONTROL_SKILL",
  "ULTIMATE",
  "NONE",
] as const;
export type Label = (typeof LABELS)[number];
export const ONCE: Label[] = [
  "JUMP",
  "NORMAL_ATTACK",
  "ATTACK_SKILL",
  "DEFENSE_SKILL",
  "CONTROL_SKILL",
  "ULTIMATE",
];
export const PROTOCOL_VERSION = 1;
export type Source = "recognizer" | "keyboard" | "simulated";
export interface Input {
  protocolVersion: 1;
  sessionId: string;
  matchId: string | null;
  seq: number;
  gesture: Label;
  generation: number;
}
export function validInput(v: any): v is Input {
  return (
    v &&
    v.protocolVersion === 1 &&
    typeof v.sessionId === "string" &&
    v.sessionId.length > 0 &&
    (v.matchId === null || typeof v.matchId === "string") &&
    Number.isSafeInteger(v.seq) &&
    v.seq >= 0 &&
    Number.isSafeInteger(v.generation) &&
    v.generation >= 1 &&
    LABELS.includes(v.gesture) &&
    Object.keys(v).every((k) =>
      [
        "protocolVersion",
        "sessionId",
        "matchId",
        "seq",
        "gesture",
        "generation",
        "diagnostics",
      ].includes(k),
    ) &&
    JSON.stringify(v).length <= 2048
  );
}
