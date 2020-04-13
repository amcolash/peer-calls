import { Rooms } from './reducers/rooms';
import { ROOM_MAIN } from './constants';

export function getRoom(rooms: Rooms, userId: string): string {
  const room = rooms[userId];
  if (room) return room;

  return ROOM_MAIN;
}
