const welcomeMessage = `
    .::         .:         .:: ::        .:       .:::     .::.::::::::.::: .::::::
 .::   .::     .: ::     .::    .::     .: ::     .: .::   .::.::           .::    
.::           .:  .::     .::          .:  .::    .:: .::  .::.::           .::    
.::          .::   .::      .::       .::   .::   .::  .:: .::.::::::       .::    
.::         .:::::: .::        .::   .:::::: .::  .::   .: .::.::           .::    
 .::   .:: .::       .:: .::    .:: .::       .:: .::    .: ::.::           .::    
   .::::  .::         .::  .:: ::  .::         .::.::      .::.::::::::     .::    


'||''|.                                .            .|'''.|                                           
 ||   ||    ....  .. .. ..     ...   .||.    ....   ||..  '    ....  ... ..  .... ...   ....  ... ..  
 ||''|'   .|...||  || || ||  .|  '|.  ||   .|...||   ''|||.  .|...||  ||' ''  '|.  |  .|...||  ||' '' 
 ||   |.  ||       || || ||  ||   ||  ||   ||      .     '|| ||       ||       '|.|   ||       ||     
.||.  '|'  '|...' .|| || ||.  '|..|'  '|.'  '|...' |'....|'   '|...' .||.       '|     '|...' .||.    
                                                                                                        
`;

// tslint:disable-next-line: no-console
console.log('\x1b[34m', welcomeMessage, '\x1b[0m');

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { createConnection } from 'typeorm';
import * as WebSocket from 'ws';
import app from './app';
import { Configuration } from './config';
import { logger } from './logger';

import { ChannelsRouter } from './routers/channelsRoute';

logger.info('casa-net remote server app starting...');

(async () => {
  try {
    await createConnection();
    logger.info('successfully connected to DB');

    // Start HTTP application
    let server: any = http.createServer(app).listen(process.env.PORT || Configuration.http.httpPort, () => {
      logger.info('HTTP listen on port ' + Configuration.http.httpPort);
    });

    // SSL/HTTPS
    if (Configuration.http.useHttps) {
      try {
        const key = fs.readFileSync(path.join(__dirname, '/../encryption/private.key'));
        const cert = fs.readFileSync(path.join(__dirname, '/../encryption/certificate.crt'));
        const ca = fs.readFileSync(path.join(__dirname, '/../encryption/ca_bundle.crt'));

        const sslOptions: https.ServerOptions = {
          key,
          cert,
          ca,
        };

        /** Prefer https. */
        server = https.createServer(sslOptions, app).listen(Configuration.http.httpsPort, () => {
          logger.info('HTTPS/SSL listen on port ' + Configuration.http.httpsPort);
        });
      } catch (error) {
        logger.fatal(`Failed to load SSL certificate ${error}, exit...`);
        process.exit();
      }
    }

    const wss = new WebSocket.Server({ server });
    const channelsRouter = new ChannelsRouter();
    channelsRouter.IncomingWsChannels(wss);

    logger.info('listening to WS channels...');
  } catch (error) {
    logger.fatal('DB connection failed, exiting...', error);
    process.exit();
  }
})();
