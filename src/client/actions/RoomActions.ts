import { ROOM_SET } from '../constants';

export interface RoomSetPayload {
  room: string;
  userId: string;
}

export interface RoomSetAction {
  type: 'ROOM_SET';
  payload: RoomSetPayload;
}

export function setRoom(payload: RoomSetPayload): RoomSetAction {
  return {
    type: ROOM_SET,
    payload,
  };
}

export type RoomActions = RoomSetAction;
