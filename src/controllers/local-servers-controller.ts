import * as cryptoJs from 'crypto-js';
import * as express from 'express';
import * as randomstring from 'randomstring';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Path,
  Post,
  Put,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa';
import { Configuration } from '../config';
import {
  createServer,
  deleteServer,
  getServer,
  getServers,
  setServerSession,
  updateServer,
  verifyAndGetLocalServer,
} from '../data-access';
import { logger } from '../logger';
import { ChannelsSingleton } from '../logic';
import { LocalServer, LocalServerStatus, ServerCertificates, ServerSession } from '../models';
import { ErrorResponse } from '../models/sharedInterfaces';
import { SchemaValidator, serverSchema } from '../security/schemaValidator';

@Tags('Servers')
@Route('servers')
export class LocalServersController extends Controller {
  /**
   * Get local servers in the system.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Get()
  public async getServers(): Promise<LocalServerStatus[]> {
    const servers = (await getServers()) as LocalServerStatus[];
    /** Add server status to each server */
    for (const server of servers) {
      server.connectionStatus = await ChannelsSingleton.connectionStatus(server.macAddress);
    }
    return servers;
  }

  /**
   * Add a new local server to the system.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Post()
  public async createServer(@Body() server: LocalServer): Promise<void> {
    try {
      server = await SchemaValidator(server, serverSchema);
    } catch (err) {
      this.setStatus(422);
      return err.error.message;
    }
    return await createServer(server);
  }

  /**
   * Update local server properties.
   * @param serverId local server physical address.
   * @param localServer new properties object to set.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Put('{serverId}')
  public async updateLocalServer(serverId: string, @Body() server: LocalServer): Promise<void> {
    try {
      server = await SchemaValidator(server, serverSchema);
    } catch (err) {
      this.setStatus(422);
      return err.error.message;
    }
    server.macAddress = serverId;
    return await updateServer(server);
  }

  /**
   * Remove local server from the system.
   * @param serverId local server physical address.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Delete('{serverId}')
  public async deleteLocalServer(serverId: string): Promise<void> {
    await deleteServer(serverId);
    await ChannelsSingleton.disconnectLocalServer(serverId);
  }

  /**
   * Generate a new authentication key for the local server.
   * (delete current key if exist).
   *
   * KEEP GENERATED KEY PRIVATE AND SECURE,
   * PUT IT IN YOUR LOCAL SERVER AND NEVER SHOW IT TO ANYBODY!!!
   * @param serverId local server physical address to generate for.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Post('{serverId}/auth')
  public async generateAuthKeyLocalServer(serverId: string): Promise<string> {
    const server = await getServer(serverId);

    /** Generate key */
    const sessionKey = randomstring.generate(64);

    /**
     * Hash it to save only hash and *not* key plain text
     */
    const hashedKey = cryptoJs.SHA512(sessionKey + Configuration.keysHandling.saltHash).toString();

    /** Create session object */
    const serverSession: ServerSession = {
      server,
      hashedKey,
    };

    /** Update (or create if not exists) the server keys */
    await setServerSession(serverSession);

    /** Disconnect local server (if connected) */
    await ChannelsSingleton.disconnectLocalServer(serverId);

    return sessionKey;
  }

  /**
   * Fetch local server logs.
   * @param serverId local server physical address.
   */
  @Security('adminAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Get('{serverId}/logs')
  public async fetchServerLogs(@Request() request: express.Request, serverId: string) {
    logger.info(`[LocalServersController.fetchServerLogs] Feting ${serverId} server logs request arrived`);
    const base64Logs = await ChannelsSingleton.fetchLocalLogsViaChannels(serverId);
    logger.info(`[LocalServersController.fetchServerLogs] Converting ${serverId} server logs to buffer...`);
    const file = Buffer.from(base64Logs, 'base64');
    const res = request.res as express.Response;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end(file);
    logger.info(`[LocalServersController.fetchServerLogs] The ${serverId} server logs sent`);
  }

  @Security('rfRepositoryAuth')
  @Response<ErrorResponse>(501, 'Server error')
  @Post('verification')
  public async serverVerification(
    @Request() request: express.Request,
    @Body() serverCertificates: ServerCertificates,
  ): Promise<LocalServer> {
    logger.info(`[LocalServersController.fetchServerLogs] Detecting ${serverCertificates.key} server certificates`);
    return await verifyAndGetLocalServer(serverCertificates);
  }
}
