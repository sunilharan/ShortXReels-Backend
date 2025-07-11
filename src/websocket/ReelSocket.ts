import { Socket } from 'socket.io';
import SocketInterface from './SocketInterface';

class ReelSocket implements SocketInterface {
  handleConnection(socket: Socket) {
    socket.emit('ping', 'Hello! Welcome to Instagram real-time socket');
  }

  middlewareImplementation(socket: Socket, next: any) {
    socket.on('joinRoom', (id) => {
      console.log('User joined room', id);
      if (id) {
        socket.join(id);
        socket.emit('joinedRoom', `User joined ${id}`);
      } 
    });
    socket.on('leaveRoom', (id) => {
      console.log('User left room', id);
      if (socket.rooms.has(id)) {
        socket.leave(id);
        socket.emit('leftRoom', `User left ${id}`);
      }
    });
    socket.on('disconnect', () => {
      socket.rooms.forEach(room => {
        if (room !== socket.id) { 
          socket.leave(room);
        }
      });
    });
    return next();
  }
}

export default ReelSocket;
