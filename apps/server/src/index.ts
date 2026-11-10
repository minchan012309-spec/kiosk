import { resolve } from 'node:path';
import { startServer } from './startup';
const development=process.env.CAFE_DEV==='1';
startServer({dataDir:resolve(process.env.CAFE_DATA||'.data'),webRoot:resolve('dist/web'),host:process.env.CAFE_HOST||(development?'127.0.0.1':'0.0.0.0'),port:Number(process.env.CAFE_PORT||8443),development}).then(server=>{
 console.log(`Festival PC Club: ${server.url}`);
 if(!server.db.prepare('SELECT data FROM state WHERE id=1').get())return;
 console.log('First setup token is stored locally in the data directory (setup-token).');
 const stop=async()=>{await server.app.close();server.db.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}).catch(e=>{console.error(e.message);process.exitCode=1;});
