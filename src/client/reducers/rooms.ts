import { ROOM_SET, PEER_REMOVE, ME } from '../constants';
import { RoomActions } from '../actions/RoomActions';
import { RemovePeerAction } from '../actions/PeerActions';
import { room } from '../window';
import omit from 'lodash/omit';

export type Rooms = Record<string, string | undefined>;

const defaultState: Rooms = {
  [ME]: room,
};

export default function rooms(state = defaultState, action: RoomActions | RemovePeerAction) {
  switch (action.type) {
    case PEER_REMOVE:
      return omit(state, [action.payload.userId]);
    case ROOM_SET:
      return {
        ...state,
        [action.payload.userId]: action.payload.room,
      };
    default:
      return state;
  }
}
