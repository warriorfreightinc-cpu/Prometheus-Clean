import { Injectable, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtAuthGuardSocket } from "src/auth/auth.guard.socket";

@Injectable()
@UseGuards(JwtAuthGuardSocket)
@WebSocketGateway({
  cors: true,
  transports: [
    'websocket',
    'polling'
  ]
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) { }



  handleConnection(client: Socket, ...args: any[]) {
    console.log("try to connect");

    try {
      const token = client.handshake.auth.token;
      if (!token) {
        console.log("No token provided, disconnecting...");
        client.disconnect();
        return;
    }
      this.jwtService.verify(token?.split(" ")[1]);
      console.log("user connected")

      let decoded: any = this.jwtService.decode(token.split(" ")[1])

      client.join(decoded.id);
      client.join(decoded.companyId + "_" + decoded.role);

    

    } catch (err) {
      console.log("Invalid token, disconnecting:", err);
      client.disconnect();
    }
  }


  // @SubscribeMessage('sendMessage')
  // handleMessage(socket: Socket, message: Array<Object>) {
  //   this.server.emit('newMessage', message);
  // }

  broadcast(rooms: string | string[], data: any) {
    this.server.to(rooms).emit("notify", data);
  }
  broadcastForMessage(rooms: string | string[], data: any) {
    this.server.to(rooms).emit("message", data);
  }


  handleDisconnect(client: any) {
   console.log("client disconnected")
  }

}
