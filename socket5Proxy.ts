import net = require("net");
import dns = require("dns");
import {Socket} from "net";

let port : number = 1088;
let host : string = "0.0.0.0";


function inet_addr(ip : string) : Buffer{
    let str_num : string[] = ip.split('.');
    let nums : number[] = [];
    str_num.forEach((elem : string)=>{
        nums.push(parseInt(elem));
    });
    nums.reverse();
    console.log("nums : " + nums);
    let buf : Buffer = Buffer.allocUnsafe(4);
    buf.writeUInt8(nums[0], 0);
    buf.writeUInt8(nums[1], 1);
    buf.writeUInt8(nums[2], 2);
    buf.writeUInt8(nums[3], 3);
    return buf;
}

//同步的方式注册回调函数
function register_once(socket: net.Socket) : Promise<Buffer>{
    return new Promise<Buffer>((resolve, reject) =>{
        socket.once('data', (data: Buffer):void=>{
            resolve(data);
        })
    } );
}


function dns_lookup(url : string) : Promise<string>{
    return new Promise<string>((resolve, reject)=> {
        dns.lookup(url, (err : NodeJS.ErrnoException | null, address : string, family : number):void =>{
            if (err){
                resolve("");
            }else{
                resolve(address);
            }
        });
    });
}


function connect(port : number, url : string, dest_server : net.Socket) : Promise<void>{
    return new Promise<void>((resolve, reject)=>{
        dest_server.connect(port, url, () : void=>{
            resolve();
        })
    });
}

async function negotiation_auth_method(socket : net.Socket): Promise<void>{
    let data : Buffer = await register_once(socket);
    let version : number = data[0];
    if (version != 5){
        console.log("version error!");
        socket.destroy();
        return;
    }
    let method_num = data[1];
    console.log("method_num : %s, package len : %s", method_num, data.length);
    if(data.length != 2 + method_num){
        console.log("data len err!");
        socket.destroy();
        return;
    }
    let buf : Buffer = Buffer.from([0x05,0x00]);
    socket.write(buf);
    console.log("auth_method success!");
}

async  function request_detail(socket : net.Socket): Promise<void>{
    let data : Buffer = await register_once(socket);
    let ver : number    = data[0];
    let cmd : number    = data[1];
    let rsv : number    = data[2];
    let atype: number   = data[3];
    if (cmd != 0x01){
        console.log("cmd err!");
        socket.destroy();
        return;
    }
    if (atype == 0x01) {
        let dest_host:number = data.readUInt32BE(4); //TODO 这里=== 客户端发个整数过来,看看这里应该如何读取
        let dest_port:number = data.readUInt16BE(8); // TODO 这里的代码未调试,可能有问题
        console.log("dest_host : %d, dest_port : %d ", dest_host, dest_port);
        // TODO 连接服务器
    }else if(atype == 0x03){
        let url_len : number = data[4];
        let url : string = data.toString("ascii", 5, 5 + url_len);
        let dest_port : number = data.readInt16BE(5 + url_len);
        let dest_ip :  string = await dns_lookup(url);
        if (dest_ip == ""){
            console.log("dns lookpu err");
            socket.destroy();
            return;
        }
        let dest_server : net.Socket = new net.Socket();
        dest_server.on("error", (err: Error) : void=>{
            console.log("dest_server err : " + err);
        });
        await connect(dest_port, url,dest_server);
        let b1 : Buffer = Buffer.from([0x05, 0x00, 0x00, 0x01]);
        let b2 : Buffer = inet_addr(dest_ip);
        let b3 : Buffer = Buffer.alloc(2);
        b3.writeInt16BE(dest_port, 0);
        let responseBuf : Buffer = Buffer.concat([b1, b2, b3], 10);

        socket.write(responseBuf);
        socket.pipe(dest_server);
        dest_server.pipe(socket);
    }else {
        console.log("atype err!");
        socket.destroy();
        return;
    }
}

async  function main():Promise<void>{
    let server = net.createServer(async (socket: Socket) : Promise<void>=>{
        socket.on("error",(err: Error) : void=>{
            console.log(err);
        });

        socket.on("close", (had_error: boolean) : void=>{
            console.log("socket close");
            socket.destroy();
        });

        await negotiation_auth_method(socket);
        await request_detail(socket);
    });
    server.listen(port, host);
}

main();



