import React, { CSSProperties } from 'react';
import jdenticon from 'jdenticon';
import {
  DragDropContext,
  Draggable,
  DraggableProvided,
  DraggableStateSnapshot,
  DropResult,
  Droppable,
  DroppableStateSnapshot,
  DroppableProvided,
  ResponderProvided,
} from 'react-beautiful-dnd';
import { DialState, DIAL_STATE_HUNG_UP } from '../constants';
import { Nicknames } from '../reducers/nicknames';
import { getNickname } from '../nickname';
import { Rooms } from '../reducers/rooms';
import { RoomMessage } from '../actions/PeerActions';
import { ROOM_MAIN } from '../constants';

// Based off of the react-beautiful-dnd example: https://codesandbox.io/s/ql08j35j3q

interface RoomsProps {
  dialState: DialState;
  nicknames: Nicknames;
  onChangeRoom: (message: RoomMessage) => void;
  rooms: Rooms;
}

interface PersonBubble {
  id: string;
  content: string;
  icon: string;
}

const getItemStyle = (isDragging: boolean, draggableStyle: any) => ({
  // change background colour if dragging
  background: isDragging ? '#f7f7f7' : undefined,

  // styles we need to apply on draggables
  ...draggableStyle,
});

const getListStyle = (isDraggingOver: boolean): CSSProperties => ({
  background: isDraggingOver ? '#fafafa' : undefined,
  border: isDraggingOver ? '2px solid #ddd' : undefined,
});

const generatePersonBubble = (userId: string, nicknames: Nicknames): PersonBubble => {
  const nickname = getNickname(nicknames, userId);

  const rawSvg = jdenticon.toSvg(nickname, 50);
  const svg = btoa(unescape(encodeURIComponent(rawSvg)));

  // For now, add everything to main room
  return {
    id: userId,
    content: `${nickname}`,
    icon: svg,
  };
};

export default class RoomList extends React.Component<RoomsProps, {}> {
  onDragEnd = (result: DropResult, provided: ResponderProvided) => {
    const { source, destination, draggableId } = result;

    // dropped outside the list
    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId) {
      // TODO: Don't re-order things - figure out disabling the ui for this
    } else {
      this.props.onChangeRoom({
        type: 'room',
        payload: { room: destination.droppableId, userId: draggableId },
      });
    }
  };

  // Normally you would want to split things out into separate components.
  // But in this example everything is just done in one place for simplicity
  render() {
    if (this.props.dialState === DIAL_STATE_HUNG_UP) return null;

    const { nicknames, rooms } = this.props;

    const roomMap: { [room: string]: string[] } = {};
    Object.keys(rooms).forEach((userId) => {
      const room = rooms[userId];
      if (room) {
        if (!roomMap[room]) {
          roomMap[room] = [];
        }

        roomMap[room].push(userId);
      }
    });

    if (!roomMap[ROOM_MAIN]) roomMap[ROOM_MAIN] = [];
    if (!roomMap['testing']) roomMap['testing'] = [];

    // Sort users in each room by nickname
    Object.keys(roomMap).forEach((k) => {
      roomMap[k] = roomMap[k].sort((a, b) => {
        const nickA = getNickname(nicknames, a);
        const nickB = getNickname(nicknames, b);

        return nickA.localeCompare(nickB);
      });
    });

    // Always keep Main as the first item in the room list
    const sortedRooms = Object.keys(roomMap).sort((a, b) => {
      if (a === ROOM_MAIN) return -1;
      if (b === ROOM_MAIN) return 1;

      return a.localeCompare(b);
    });

    return (
      <div className="rooms">
        <DragDropContext onDragEnd={this.onDragEnd}>
          {sortedRooms.map((room: string) => (
            <div className="room" key={room}>
              <div className="roomTitle">{room}</div>
              <Droppable droppableId={room} key={room}>
                {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                  <div className="roomList" ref={provided.innerRef} style={getListStyle(snapshot.isDraggingOver)}>
                    {roomMap[room].map((userId, index) => {
                      const item = generatePersonBubble(userId, nicknames);

                      return (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                            <div
                              className="roomPeer"
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={getItemStyle(snapshot.isDragging, provided.draggableProps.style)}
                            >
                              {item.content}
                              <img src={`data:image/svg+xml;base64,${item.icon}`} />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </DragDropContext>
      </div>
    );
  }
}
