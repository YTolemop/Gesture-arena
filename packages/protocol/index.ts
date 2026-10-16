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
  gesture?: Label;
  commands?: Commands;
  generation: number;
}
export interface Commands { left: Label; right: Label; both: Label }
export function validCommands(v: any): v is Commands {
  return !!v && typeof v === "object" && !Array.isArray(v) &&
    Object.keys(v).length === 3 &&
    ["left", "right", "both"].every(k => LABELS.includes(v[k])) &&
    (v.both === "NONE" || (v.left === "NONE" && v.right === "NONE"));
}
export function inputLabels(v: Input): Label[] {
  return v.commands ? [...new Set([v.commands.left, v.commands.right, v.commands.both])].filter(x => x !== "NONE") : [v.gesture!];
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
    ((Object.prototype.hasOwnProperty.call(v, "gesture") && !Object.prototype.hasOwnProperty.call(v, "commands") && LABELS.includes(v.gesture)) ||
      (!Object.prototype.hasOwnProperty.call(v, "gesture") && validCommands(v.commands))) &&
    Object.keys(v).every((k) =>
      [
        "protocolVersion",
        "sessionId",
        "matchId",
        "seq",
        "gesture",
        "commands",
        "generation",
        "diagnostics",
      ].includes(k),
    ) &&
    JSON.stringify(v).length <= 2048
  );
}
