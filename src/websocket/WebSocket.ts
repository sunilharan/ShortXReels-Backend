import { Server, Socket } from "socket.io";

const WEBSOCKET_CORS = {
  origin: "*",
  methods: ["GET", "POST"],
};

class WebSocket extends Server {
  private static io: WebSocket;

  private constructor(httpServer?: any) {
    super(httpServer, { cors: WEBSOCKET_CORS });
  }

  public static getInstance(httpServer?: any): WebSocket {
    if (!WebSocket.io) {
      WebSocket.io = new WebSocket(httpServer);
    }
    return WebSocket.io;
  }

  public initializeHandlers(socketHandlers: Array<{ path: string; handler: any }>) {
    socketHandlers.forEach(({ path, handler }) => {
      const namespace = WebSocket.io.of(path);

      if (handler.middlewareImplementation) {
        namespace.use(handler.middlewareImplementation.bind(handler));
      }

      namespace.on("connection", (socket: Socket) => {
        handler.handleConnection(socket);
      });
    });
  }
}

export default WebSocket;
