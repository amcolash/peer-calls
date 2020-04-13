import React, { Fragment, CSSProperties } from 'react';
import jdenticon from 'jdenticon';
import {
  DragDropContext,
  Draggable,
  DraggableLocation,
  DraggableProvided,
  DraggableStateSnapshot,
  DropResult,
  Droppable,
  DroppableStateSnapshot,
  DroppableProvided,
} from 'react-beautiful-dnd';
import update from 'immutability-helper';
import { DialState, DIAL_STATE_IN_CALL } from '../constants';
import { StreamsState } from '../reducers/streams';
import Peer from 'simple-peer';

// Based off of the react-beautiful-dnd example: https://codesandbox.io/s/ql08j35j3q

interface RoomsProps {
  dialState: DialState;
  peers: Record<string, Peer.Instance>;
  streams: StreamsState;
}

interface RoomsState {
  items: { [roomName: string]: PersonBubble[] };
}

interface PersonBubble {
  id: string;
  content: string;
  icon: string;
}

// fake data generator
const getItems = (count: number, offset: number = 0): PersonBubble[] => {
  const items = [];

  for (let i = 0; i < count; i++) {
    const index = i + offset;
    const rawSvg = jdenticon.toSvg(index, 50);
    const svg = btoa(unescape(encodeURIComponent(rawSvg)));

    items.push({
      id: `item-${index}`,
      content: `person ${index}`,
      icon: svg,
    });
  }

  return items;
};

// // a little function to help us with reordering the result
const reorder = (list: PersonBubble[], startIndex: number, endIndex: number): PersonBubble[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);

  return result;
};

// /**
//  * Moves an item from one list to another list.
//  */
const move = (
  source: PersonBubble[],
  destination: PersonBubble[],
  droppableSource: DraggableLocation,
  droppableDestination: DraggableLocation
): { [roomId: string]: PersonBubble[] } => {
  const sourceClone = Array.from(source);
  const destClone = Array.from(destination);
  const [removed] = sourceClone.splice(droppableSource.index, 1);

  destClone.splice(droppableDestination.index, 0, removed);

  const result: { [roomId: string]: PersonBubble[] } = {};
  result[droppableSource.droppableId] = sourceClone;
  result[droppableDestination.droppableId] = destClone;

  return result;
};

const getItemStyle = (isDragging: boolean, draggableStyle: any) => ({
  // change background colour if dragging
  background: isDragging ? '#f7f7f7' : undefined,

  // styles we need to apply on draggables
  ...draggableStyle,
});

const getListStyle = (isDraggingOver: boolean): CSSProperties => ({
  background: isDraggingOver ? '#fafafa' : undefined,
  outline: isDraggingOver ? '2px solid #ddd' : undefined,
});

export default class Rooms extends React.Component<RoomsProps, RoomsState> {
  state: RoomsState = {
    items: {
      main: getItems(5),
      sidebar: getItems(2, 5),
      empty: [],
    },
  };

  onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    // dropped outside the list
    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId) {
      const reordered = reorder(this.state.items[source.droppableId], source.index, destination.index);
      const items = update(this.state.items, {
        [source.droppableId]: { $set: reordered },
      });

      this.setState({ items });
    } else {
      const result: { [id: string]: PersonBubble[] } = move(
        this.state.items[source.droppableId],
        this.state.items[destination.droppableId],
        source,
        destination
      );
      let items = update(this.state.items, {
        [source.droppableId]: { $set: result[source.droppableId] },
      });
      items = update(items, {
        [destination.droppableId]: { $set: result[destination.droppableId] },
      });

      this.setState({ items });
    }
  };

  // Normally you would want to split things out into separate components.
  // But in this example everything is just done in one place for simplicity
  render() {
    if (this.props.dialState === 'hung-up') return null;

    return (
      <div className="rooms">
        <DragDropContext onDragEnd={this.onDragEnd}>
          {Object.keys(this.state.items).map((k: string) => (
            <div className="room">
              <div className="roomTitle">{k}</div>
              <Droppable droppableId={k} key={`col${k}`}>
                {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                  <div className="roomList" ref={provided.innerRef} style={getListStyle(snapshot.isDraggingOver)}>
                    {this.state.items[k].map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                          <div
                            className="roomPeer"
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={getItemStyle(snapshot.isDragging, provided.draggableProps.style)}
                          >
                            {/* {item.content} */}
                            <img src={`data:image/svg+xml;base64,${item.icon}`} />
                          </div>
                        )}
                      </Draggable>
                    ))}
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
