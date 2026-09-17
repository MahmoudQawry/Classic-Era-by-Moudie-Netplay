export type RoomSystem = "nes" | "ps1" | "psp" | "sega" | "n64" | "ps2";

export const MIN_ACTIVE_PLAYERS = 2;
export const STANDARD_MAX_ACTIVE_PLAYERS = 4;
export const STANDARD_MAX_SPECTATORS = 4;
export const MAX_ACTIVE_PLAYERS = STANDARD_MAX_ACTIVE_PLAYERS;
export const FAMICOM_MAX_ACTIVE_PLAYERS = 2;
export const FAMICOM_MAX_SPECTATORS = 6;

export type RoomCapacity = { minPlayers: number; maxPlayers: number; maxSpectators: number };

/** Eight-member envelope. N64/PS2 use 4 player seats + 4 spectators; individual games can use fewer controller ports. */
export const ROOM_CAPACITIES: Record<RoomSystem, RoomCapacity> = {
  nes: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: FAMICOM_MAX_ACTIVE_PLAYERS, maxSpectators: FAMICOM_MAX_SPECTATORS },
  ps1: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  psp: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  sega: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  n64: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  ps2: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
};

export function roomCapacityFor(system: RoomSystem): RoomCapacity { return ROOM_CAPACITIES[system]; }
export function roomMemberLimit(system: RoomSystem): number { const c = roomCapacityFor(system); return c.maxPlayers + c.maxSpectators; }
export function canStartOnlineSession(system: RoomSystem, activePlayers: number): boolean { const c = roomCapacityFor(system); return activePlayers >= c.minPlayers && activePlayers <= c.maxPlayers; }
export type SeatDecisionReason = "room-full" | "players-full" | "spectators-full";
export type SeatDecision = { allowed: boolean; reason?: SeatDecisionReason };
export function decideSeat(members: { role: string }[], requested: "player" | "spectator", capacity: RoomCapacity): SeatDecision {
  const activePlayers = members.filter((m) => m.role === "host" || m.role === "player").length;
  const spectators = members.filter((m) => m.role === "spectator").length;
  if (activePlayers + spectators >= capacity.maxPlayers + capacity.maxSpectators) return { allowed: false, reason: "room-full" };
  if (requested === "player" && activePlayers >= capacity.maxPlayers) return { allowed: false, reason: "players-full" };
  if (requested === "spectator" && spectators >= capacity.maxSpectators) return { allowed: false, reason: "spectators-full" };
  return { allowed: true };
}
export function activeSeatNumber(memberIds: number[], memberId: number, system: RoomSystem = "ps1"): number | null {
  const index = memberIds.indexOf(memberId); const maxPlayers = roomCapacityFor(system).maxPlayers;
  return index >= 0 && index < maxPlayers ? index + 1 : null;
}
export function roomCapacityLabel(system: RoomSystem): string { const c = roomCapacityFor(system); return `${c.minPlayers}-${c.maxPlayers} PLAYERS · ${c.maxSpectators} SPECTATORS`; }
