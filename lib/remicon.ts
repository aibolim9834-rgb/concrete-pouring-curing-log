// One ready-mix truck carries 6 m³; a part load still counts as a truck, so 7 m³ is 2대.
const REMICON_TRUCK_M3 = 6;
export const remiconTrucks = (volume: number) => volume > 0 ? Math.ceil(volume / REMICON_TRUCK_M3) : 0;
