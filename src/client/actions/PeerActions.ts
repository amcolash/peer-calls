import * as ChatActions from './ChatActions';
import * as NicknameActions from './NicknameActions';
import * as RoomActions from './RoomActions';
import * as NotifyActions from './NotifyActions';
import * as StreamActions from './StreamActions';
import * as constants from '../constants';
import Peer, { SignalData } from 'simple-peer';
import forEach from 'lodash/forEach';
import _debug from 'debug';
import { iceServers, userId } from '../window';
import { Dispatch, GetState } from '../store';
import { ClientSocket } from '../socket';
import { getNickname } from '../nickname';
import { ROOM_MAIN } from '../constants';

const debug = _debug('peercalls');
const myId = userId;

export interface Peers {
  [id: string]: Peer.Instance;
}

export interface PeerHandlerOptions {
  socket: ClientSocket;
  user: { id: string };
  dispatch: Dispatch;
  getState: GetState;
}

class PeerHandler {
  socket: ClientSocket;
  user: { id: string };
  dispatch: Dispatch;
  getState: GetState;

  constructor(readonly options: PeerHandlerOptions) {
    this.socket = options.socket;
    this.user = options.user;
    this.dispatch = options.dispatch;
    this.getState = options.getState;
  }
  handleError = (err: Error) => {
    const { dispatch, getState, user } = this;
    debug('peer: %s, error %s', user.id, err.stack);
    dispatch(NotifyActions.error('A peer connection error occurred'));
    const peer = getState().peers[user.id];
    peer && peer.destroy();
    dispatch(removePeer(user.id));
  };
  handleSignal = (signal: SignalData) => {
    const { socket, user } = this;
    debug('peer: %s, signal: %o', user.id, signal);

    const payload = { userId: user.id, signal };
    socket.emit('signal', payload);
  };
  handleConnect = () => {
    const { dispatch, user, getState } = this;
    debug('peer: %s, connect', user.id);
    dispatch(NotifyActions.warning('Peer connection established'));

    const state = getState();
    const peer = state.peers[user.id];
    const localStream = state.streams[constants.ME];
    localStream &&
      localStream.streams.forEach((s) => {
        // If the local user pressed join call before this peer has joined the
        // call, now is the time to share local media stream with the peer since
        // we no longer automatically send the stream to the peer.
        s.stream.getTracks().forEach((track) => {
          peer.addTrack(track, s.stream);
        });
      });
    const nickname = state.nicknames[constants.ME];
    if (nickname) {
      sendData(peer, {
        payload: { nickname },
        type: 'nickname',
      });
    }

    // When a peer connects to this client, send it back the current client room
    const room = state.rooms[constants.ME];
    if (room) {
      sendData(peer, {
        payload: { room, userId: myId },
        type: 'room',
      });
    }
  };
  handleTrack = (track: MediaStreamTrack, stream: MediaStream) => {
    const { user, dispatch } = this;
    const userId = user.id;
    debug('peer: %s, track: %s', userId, track.id);
    // Listen to mute event to know when a track was removed
    // https://github.com/feross/simple-peer/issues/512
    track.onmute = () => {
      debug('peer: %s, track muted: %s', userId, track.id);
      dispatch(
        StreamActions.removeTrack({
          userId,
          stream,
          track,
        })
      );
    };
    track.onunmute = () => {
      debug('peer: %s, track unmuted: %s', userId, track.id);
      dispatch(
        StreamActions.addTrack({
          userId,
          stream,
          track,
        })
      );
    };
    dispatch(
      StreamActions.addStream({
        userId,
        stream,
      })
    );
  };
  handleData = (buffer: ArrayBuffer) => {
    const { dispatch, getState, user } = this;
    const state = getState();
    const message = JSON.parse(new window.TextDecoder('utf-8').decode(buffer));
    debug('peer: %s, message: %o', user.id, message);
    switch (message.type) {
      case 'file':
        dispatch(
          ChatActions.addMessage({
            userId: user.id,
            message: message.payload.name,
            timestamp: new Date().toLocaleString(),
            image: message.payload.data,
          })
        );
        break;
      case 'nickname':
        dispatch(
          ChatActions.addMessage({
            userId: constants.PEERCALLS,
            message: 'User ' + getNickname(state.nicknames, user.id) + ' is now known as ' + (message.payload.nickname || user.id),
            timestamp: new Date().toLocaleString(),
            system: true,
            image: undefined,
          })
        );
        dispatch(
          NicknameActions.setNickname({
            userId: user.id,
            nickname: message.payload.nickname,
          })
        );
        break;
      // This is a a really confusing way of handling data and sending things around (in my opinion). Whatever the case is though, I will
      // try to explain it a little bit so I can understand in the future if needed.
      // This case is when this client gets a payload message and needs to handle a local update
      case 'room':
        dispatch(
          ChatActions.addMessage({
            userId: constants.PEERCALLS,
            message: 'User ' + getNickname(state.nicknames, user.id) + ' moved to room ' + (message.payload.room || ROOM_MAIN),
            timestamp: new Date().toLocaleString(),
            system: true,
            image: undefined,
          })
        );

        let userId = message.payload.userId;

        // If the client got a payload with ME, then fix that id to actually make sense - since the context no longer correct. All outgoing
        // will send ME since that is the paradigm in this codebase.
        if (userId === constants.ME) userId = user.id;

        // If the client receives a message that contains its own id, transform it back to ME locally
        if (userId === myId) userId = constants.ME;

        dispatch(RoomActions.setRoom({ userId, room: message.payload.room }));
        break;
      default:
        dispatch(
          ChatActions.addMessage({
            userId: user.id,
            message: message.payload,
            timestamp: new Date().toLocaleString(),
            image: undefined,
          })
        );
    }
  };
  handleClose = () => {
    const { dispatch, user, getState } = this;
    dispatch(NotifyActions.error('Peer connection closed'));
    const state = getState();
    const userStreams = state.streams[user.id];
    userStreams &&
      userStreams.streams.forEach((s) => {
        dispatch(StreamActions.removeStream(user.id, s.stream));
      });
    dispatch(removePeer(user.id));
  };
}

export interface CreatePeerOptions {
  socket: ClientSocket;
  user: { id: string };
  initiator: string;
  stream?: MediaStream;
}

/**
 * @param {Object} options
 * @param {Socket} options.socket
 * @param {User} options.user
 * @param {String} options.user.id
 * @param {Boolean} [options.initiator=false]
 * @param {MediaStream} [options.stream]
 */
export function createPeer(options: CreatePeerOptions) {
  const { socket, user, initiator, stream } = options;

  return (dispatch: Dispatch, getState: GetState) => {
    const userId = user.id;
    debug('create peer: %s, stream:', userId, stream);
    dispatch(NotifyActions.warning('Connecting to peer...'));

    const oldPeer = getState().peers[userId];
    if (oldPeer) {
      dispatch(NotifyActions.info('Cleaning up old connection...'));
      oldPeer.destroy();
      dispatch(removePeer(userId));
    }

    const peer = new Peer({
      initiator: userId === initiator,
      config: { iceServers },
      // Allow the peer to receive video, even if it's not sending stream:
      // https://github.com/feross/simple-peer/issues/95
      offerConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      },
      stream,
    });

    const handler = new PeerHandler({
      socket,
      user,
      dispatch,
      getState,
    });

    peer.once(constants.PEER_EVENT_ERROR, handler.handleError);
    peer.once(constants.PEER_EVENT_CONNECT, handler.handleConnect);
    peer.once(constants.PEER_EVENT_CLOSE, handler.handleClose);
    peer.on(constants.PEER_EVENT_SIGNAL, handler.handleSignal);
    peer.on(constants.PEER_EVENT_TRACK, handler.handleTrack);
    peer.on(constants.PEER_EVENT_DATA, handler.handleData);

    dispatch(addPeer({ peer, userId }));
  };
}

export interface AddPeerParams {
  peer: Peer.Instance;
  userId: string;
}

export interface AddPeerAction {
  type: 'PEER_ADD';
  payload: AddPeerParams;
}

export const addPeer = (payload: AddPeerParams): AddPeerAction => ({
  type: constants.PEER_ADD,
  payload,
});

export interface RemovePeerAction {
  type: 'PEER_REMOVE';
  payload: { userId: string };
}

export const removePeer = (userId: string): RemovePeerAction => ({
  type: constants.PEER_REMOVE,
  payload: { userId },
});

export type PeerAction = AddPeerAction | RemovePeerAction;

export interface TextMessage {
  type: 'text';
  payload: string;
}

export interface Base64File {
  name: string;
  size: number;
  type: string;
  data: string;
}

export interface FileMessage {
  type: 'file';
  payload: Base64File;
}

export interface NicknameMessage {
  type: 'nickname';
  payload: {
    nickname: string;
  };
}

export interface RoomMessage {
  type: 'room';
  payload: {
    room: string;
    userId: string;
  };
}

export type Message = TextMessage | FileMessage | NicknameMessage | RoomMessage;

function sendData(peer: Peer.Instance, message: Message) {
  peer.send(JSON.stringify(message));
}

export const sendMessage = (message: Message) => (dispatch: Dispatch, getState: GetState) => {
  const { nicknames, peers } = getState();
  debug('Sending message type: %s to %s peers.', message.type, Object.keys(peers).length);
  switch (message.type) {
    case 'file':
      dispatch(
        ChatActions.addMessage({
          userId: constants.ME,
          message: 'Send file: "' + message.payload.name + '" to all peers',
          timestamp: new Date().toLocaleString(),
          image: message.payload.data,
        })
      );
      break;
    case 'nickname':
      dispatch(
        ChatActions.addMessage({
          userId: constants.PEERCALLS,
          message: 'You are now known as: ' + message.payload.nickname,
          timestamp: new Date().toLocaleString(),
          system: true,
          image: undefined,
        })
      );
      dispatch(
        NicknameActions.setNickname({
          userId: constants.ME,
          nickname: message.payload.nickname,
        })
      );
      break;
    // This case is where the client updates its own state and needs to send the data to other peers
    case 'room':
      dispatch(
        ChatActions.addMessage({
          userId: constants.PEERCALLS,
          message:
            message.payload.userId === constants.ME
              ? 'You are now in the room: ' + message.payload.room
              : 'User ' + getNickname(nicknames, message.payload.userId) + ' moved to room ' + (message.payload.room || ROOM_MAIN),
          timestamp: new Date().toLocaleString(),
          system: true,
          image: undefined,
        })
      );
      dispatch(
        RoomActions.setRoom({
          userId: message.payload.userId,
          room: message.payload.room,
        })
      );
      break;
    default:
      dispatch(
        ChatActions.addMessage({
          userId: constants.ME,
          message: message.payload,
          timestamp: new Date().toLocaleString(),
          image: undefined,
        })
      );
  }
  forEach(peers, (peer, userId) => {
    sendData(peer, message);
  });
};

export const sendFile = (file: File) => async (dispatch: Dispatch, getState: GetState) => {
  const { name, size, type } = file;
  if (!window.FileReader) {
    dispatch(NotifyActions.error('File API is not supported by your browser'));
    return;
  }
  const reader = new window.FileReader();
  const base64File = await new Promise<Base64File>((resolve) => {
    reader.addEventListener('load', () => {
      resolve({
        name,
        size,
        type,
        data: reader.result as string,
      });
    });
    reader.readAsDataURL(file);
  });

  sendMessage({ payload: base64File, type: 'file' })(dispatch, getState);
};
