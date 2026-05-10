
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
const { setupWorker } = require("@socket.io/sticky");
const { createAdapter } = require("@socket.io/cluster-adapter");



export class ClusterIOAdapter extends IoAdapter {

    createIOServer(port: number, options?: ServerOptions): any {



        const server = super.createIOServer(port, options);
       
        
        try {
            server.adapter(createAdapter())
            setupWorker(server);
        } catch (err) {
            //console.log(err)
        }



        return server;


    }
}