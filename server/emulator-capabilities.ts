import { ROOM_CAPACITIES, roomMemberLimit, type RoomSystem } from "../shared/room-capacity.js";

export type EmulatorRoomCapability = {
  system: RoomSystem; coreName: string; maxRoomMembers: number; defaultControllerSeats: number; maxControllerSeats: number;
  netplay: "retroarch" | "psp-network"; maxPlayers: number; maxSpectators: number; note: string;
};

/** Conservative room limits keep emulator state and voice traffic predictable. */
export const EMULATOR_ROOM_CAPABILITIES: Record<RoomSystem, EmulatorRoomCapability> = {
  nes: { system: "nes", coreName: "FCEUmm", maxRoomMembers: roomMemberLimit("nes"), defaultControllerSeats: 2, maxControllerSeats: 2, netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.nes.maxPlayers, maxSpectators: ROOM_CAPACITIES.nes.maxSpectators, note: "Famicom/NES: 2 active players and up to 6 spectators." },
  ps1: { system: "ps1", coreName: "PCSX-ReARMed", maxRoomMembers: roomMemberLimit("ps1"), defaultControllerSeats: 2, maxControllerSeats: 4, netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.ps1.maxPlayers, maxSpectators: ROOM_CAPACITIES.ps1.maxSpectators, note: "Up to 4 active players and 4 spectators; game controller ports remain game-dependent." },
  psp: { system: "psp", coreName: "PPSSPP", maxRoomMembers: roomMemberLimit("psp"), defaultControllerSeats: 2, maxControllerSeats: 4, netplay: "psp-network", maxPlayers: ROOM_CAPACITIES.psp.maxPlayers, maxSpectators: ROOM_CAPACITIES.psp.maxSpectators, note: "Up to 4 active players and 4 spectators; game network limits remain game-dependent." },
  sega: { system: "sega", coreName: "Genesis Plus GX", maxRoomMembers: roomMemberLimit("sega"), defaultControllerSeats: 2, maxControllerSeats: 4, netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.sega.maxPlayers, maxSpectators: ROOM_CAPACITIES.sega.maxSpectators, note: "Up to 4 active players and 4 spectators when the game supports four controllers." },
  n64: { system: "n64", coreName: "Mupen64Plus-Next", maxRoomMembers: roomMemberLimit("n64"), defaultControllerSeats: 2, maxControllerSeats: 4, netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.n64.maxPlayers, maxSpectators: ROOM_CAPACITIES.n64.maxSpectators, note: "Nintendo 64 uses deterministic relay/lockstep room sync with up to 4 controller seats." },
  ps2: { system: "ps2", coreName: "Play!", maxRoomMembers: roomMemberLimit("ps2"), defaultControllerSeats: 2, maxControllerSeats: 4, netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.ps2.maxPlayers, maxSpectators: ROOM_CAPACITIES.ps2.maxSpectators, note: "Play! is selected for a simpler Android package; multiplayer uses Moudie deterministic input/state relay rather than core-native netplay." },
};

export function capabilityFor(system: RoomSystem): EmulatorRoomCapability { return EMULATOR_ROOM_CAPABILITIES[system]; }
