import * as cryptoJs from 'crypto-js';
import * as momoent from 'moment';
import * as moment from 'moment';
import * as randomstring from 'randomstring';
import { BehaviorSubject, Observable, Subscriber } from 'rxjs';
import { inspect } from 'util';
import * as ws from 'ws';
import { Configuration } from '../config';
import { checkSession, getServer, updateServer, updateServerConnection, updateServerDisconnection, updateServerMeta, verifyAndGetLocalServer } from '../data-access';
import { logger } from '../logger';
import { SendMail } from '../mailSender';
import { LocalServer } from '../models/local-server.model';
import {
  HttpRequest,
  HttpResponse,
  InitializationRequest,
  LocalMessage,
  LocalServerFeed,
  RemoteMessage,
} from '../models/remote2localProtocol';
import { ErrorResponse, MinionFeed, TimingFeed } from '../models/sharedInterfaces';

/**
 * Extend ws to allow hold unique id to each authenticated local server ws channel.
 * This id allow to route user requests to correct local server.
 */
export interface CasaWs extends ws {
  /**
   * unique identity each local servers.
   * (Don`t use local server id, because local server dont know it.)
   */
  machineMac: string;
}

/**
 * Manage all local servers ws I/O messages.
 * The main goal is to allow used ws protocol as req/res architecture.
 * So when user send HTTP request it will forward to local server via ws and
 * returns response, evan that ws is messages architecture based.
 */
export class Channels {
  /** Feed of local servers feeds. */
  public localServersFeed = new BehaviorSubject<{ localServerId: string; localServerFeed: LocalServerFeed }>(undefined);

  /** Allow subscribe to local servers connection status, for notification, alerts logging etc.  */
  public localServersStatusFeed = new BehaviorSubject<{ localServerId: string; theNewStatus: boolean }>(undefined);

  /**
   * Timeout for any http request.
   * (it long time because of scanning network request that takes a while.)
   */
  private httpRequestTimeout: moment.Duration = moment.duration(2, 'minutes');
  private logsRequestTimeout: moment.Duration = moment.duration(30, 'seconds');

  /** Map all local servers ws channel by local server mac address */
  private localChannelsMap: { [key: string]: CasaWs } = {};


  /**
   * Hold each request promise reject/resolve methods.
   * until message will arrive from local server with response for current request.
   */
  private sentHttpRequestsMap: {
    [key: string]: {
      timeStamped: Date;
      forwardPromise: {
        resolve: (httpResponse: HttpResponse) => {};
        reject: (errorResponse: ErrorResponse) => {};
      };
    };
  } = {};

  /**
   * Hold each request promise reject/resolve methods map by the local server id.
   * until message will arrive from local server with response for current request.
   */
  private fetchLocalLogsMap: {
    [key: string]: {
      timeStamped: Date;
      forwardPromise: {
        resolve: (httpResponse: string) => {};
        reject: (errorResponse: ErrorResponse) => {};
      };
    };
  } = {};

  /**
   * Register generated code map to account with creation timestamp.
   */
  private forwardUserReqAuth: {
    [key: string]: {
      code: string;
      timestamp: number;
    };
  } = {};

  constructor() {
    /** Invoke requests timeout activation. */
    this.setTimeoutRequestsActivation();
  }

  /**
   * Send http request to local server over ws channel.
   * @param localServerId local server physical address to send request for.
   * @param httpRequest http request message to send.
   * @returns Http response message.
   */
  public async sendHttpViaChannels(localServerId: string, httpRequest: HttpRequest): Promise<HttpResponse> {
    /**
     * Create promise to allow hold resolve/reject in map and wait for local server response.
     * (like we already know, ws is message based and not req/res based).
     */
    return new Promise<HttpResponse>((resolveHttpReq, rejectHttpReq) => {
      /** Get correct local server ws channel */
      const localServeChannel = this.localChannelsMap[localServerId];

      /** If channel not exist, mean there is no communication with local server. */
      if (!localServeChannel) {
        /** Send local server not available response */
        resolveHttpReq({
          requestId: httpRequest.requestId,
          httpBody: {
            responseCode: 4501,
            message: 'There is no connection to local server.',
          } as ErrorResponse,
          httpStatus: 501,
          httpSession: undefined,
        });
        return;
      }

      /** Generate unique id to each request to know witch response belong to current request  */
      const reqId = randomstring.generate(16);
      httpRequest.requestId = reqId;

      /** Add request promise methods to map  */
      this.sentHttpRequestsMap[reqId] = {
        timeStamped: new Date(),
        forwardPromise: {
          reject: rejectHttpReq as () => {},
          resolve: resolveHttpReq as () => {},
        },
      };

      /** Send request to local server to process it. */
      this.sendMessage(localServeChannel, {
        remoteMessagesType: 'httpRequest',
        message: {
          httpRequest,
        },
      });
    });
  }

  public async fetchLocalLogsViaChannels(localServerId: string): Promise<string> {
    /**
     * Create promise to allow hold resolve/reject in map and wait for local server response.
     * (like we already know, ws is message based and not req/res based).
     */
    return new Promise<string>((resolveLogsReq, rejectLogsReq) => {
      /** Get correct local server ws channel */
      const localServeChannel = this.localChannelsMap[localServerId];

      /** If channel not exist, mean there is no communication with local server. */
      if (!localServeChannel) {
        /** Send local server not available response */
        throw new Error('local server not connected');
      }

      /** Add request promise methods to map  */
      this.fetchLocalLogsMap[localServerId] = {
        timeStamped: new Date(),
        forwardPromise: {
          reject: rejectLogsReq as () => {},
          resolve: resolveLogsReq as () => {},
        },
      };

      /** Send request to local server to process it. */
      this.sendMessage(localServeChannel, {
        remoteMessagesType: 'fetchLogs',
        message: {},
      });
    });
  }

  /**
   * On ws just opened.
   * @param wsChannel local server incoming ws.
   */
  public onWsOpen(wsChannel: ws) {
    /** Send to local server ready to init and auth message. */
    this.sendMessage(wsChannel, { remoteMessagesType: 'readyToInitialization', message: {} });
  }

  /**
   * On message arrived from local server.
   * @param wsChannel local server ws channel.
   * @param localMessage message content.
   */
  public async onWsMessage(wsChannel: CasaWs, localMessage: LocalMessage) {
    /** If it`s init message handle it, else check access cert befor handling. */
    if (localMessage.localMessagesType === 'initialization') {
      await this.handleInitializationRequest(wsChannel, localMessage.message.initialization);
      return;
    }

    /** If ws object not own machine mac, don't allow it to do anything. */
    if (!(wsChannel.machineMac in this.localChannelsMap)) {
      logger.debug(`aborting local server message, there is no valid mac address stamp.`);
      return;
    }

    /** Route message to correct handler. */
    switch (localMessage.localMessagesType) {
      case 'httpResponse':
        this.handleHttpResponse(localMessage.message.httpResponse);
        break;
      case 'ack':
        this.sendMessage(wsChannel, { remoteMessagesType: 'ackOk', message: {} });
        break;
      case 'sendRegistrationCode':
        this.handleSendRegistrationCodeRequest(localMessage.message.sendRegistrationCode);
        break;
      case 'registerAccount':
        this.handleRegisterAccountRequest(wsChannel, localMessage.message.registerAccount);
        break;
      case 'unregisterAccount':
        this.handleUnregisterAccountRequest(wsChannel, localMessage.message.unregisterAccount);
        break;
      case 'registeredUsers':
        await this.handleGetLocalUsers(wsChannel);
        break;
      case 'feed':
        await this.handleFeedUpdate(wsChannel, localMessage.message.feed);
        break;
      case 'logs':
        await this.handleLogsResponse(wsChannel.machineMac, localMessage.message.logs);
        break;
    }
  }

  /**
   * On any ws channel closed, from any reasone.
   * @param wsChannel closed ws channel.
   */
  public async onWsClose(wsChannel: CasaWs) {
    /** If channel not passed auth, just return */
    if (!wsChannel.machineMac) {
      return;
    }

    /** Remove it from channel map. */
    delete this.localChannelsMap[wsChannel.machineMac];

    updateServerDisconnection(wsChannel.machineMac).catch((err) => {
      logger.info(`Failed to update ${wsChannel.machineMac} disconnection ${inspect(err, false, 3)}`);
    });

    logger.info(`Local server ${wsChannel.machineMac} ws channel closed`);

    /** Update subscribers with the new local server status */
    this.localServersStatusFeed.next({ localServerId: wsChannel.machineMac, theNewStatus: false });
  }

  /**
   * Disconnect local server channel.
   * @param macAddress local server physical address
   */
  public async disconnectLocalServer(macAddress: string) {
    const localServerConnection = this.localChannelsMap[macAddress];

    /** If channel not passed auth, just return */
    if (!localServerConnection) {
      return;
    }

    try {
      localServerConnection.close();
    } catch (error) { }

    /** Remove it from channel map. */
    delete this.localChannelsMap[macAddress];
    updateServerDisconnection(macAddress).catch((err) => {
      logger.info(`Failed to update ${macAddress} disconnection ${inspect(err, false, 3)}`);
    });
    logger.info(`Local server ${localServerConnection.machineMac} disconnected by the remote server`);
  }

  /**
   * Get channel connection status.
   * @param macAddress local server physical address
   */
  public async connectionStatus(macAddress: string): Promise<boolean> {
    return macAddress in this.localChannelsMap;
  }

  /**
   * Timeout of each request activation.
   * Used to clean up and send timeout response to requestes
   * that local server not answer to them.
   */
  private setTimeoutRequestsActivation() {
    setInterval(() => {
      const now = new Date();

      // Iterate all API requests.
      for (const [key, value] of Object.entries(this.sentHttpRequestsMap)) {
        if (now.getTime() - value.timeStamped.getTime() > this.httpRequestTimeout.asMilliseconds()) {
          delete this.sentHttpRequestsMap[key];
          value.forwardPromise.resolve({
            requestId: key,
            httpBody: { responseCode: 8503, message: 'local server timeout' },
            httpSession: undefined,
            httpStatus: 501,
          });
        }
      }

      for (const [key, value] of Object.entries(this.fetchLocalLogsMap)) {
        if (now.getTime() - value.timeStamped.getTime() > this.logsRequestTimeout.asMilliseconds()) {
          delete this.fetchLocalLogsMap[key];
          value.forwardPromise.reject({
            responseCode: 8503,
            message: 'local server timeout',
          } as ErrorResponse);
        }
      }
    }, moment.duration(10, 'seconds').asMilliseconds());
  }

  /**
   * Handle init request from local server, check if cert is OK.
   * @param wsChannel ws client object.
   * @param certAuth local server auth cert data
   */
  private async handleInitializationRequest(wsChannel: CasaWs, certAuth: InitializationRequest) {
    try {
      let localServer: LocalServer;
      try {
        /** Get the local server based on cert mac address. */
        localServer = await verifyAndGetLocalServer({ mac: certAuth.macAddress, key: certAuth.remoteAuthKey });
      } catch (error) {
        logger.error(`[handleInitializationRequest] Fail to authenticate local server '${certAuth.macAddress}' connection request, ${inspect(error, false, 3)}`);
        this.sendMessage(wsChannel, {
          remoteMessagesType: 'authenticationFail',
          message: {
            authenticationFail: {
              responseCode: 3403,
              message: 'authorization of local server in remote, fail',
            },
          },
        });
        throw new Error('authenticationFail');
      }


      /** If there is other channel from same local server */
      if (this.localChannelsMap[certAuth.macAddress]) {
        /** Remove authentication for any case.  */
        this.localChannelsMap[certAuth.macAddress].machineMac = null;

        /** Need to test the behavior of local server when closing old connection manually  */
        try {
          this.localChannelsMap[certAuth.macAddress].close();
        } catch (err) { }

        delete this.localChannelsMap[certAuth.macAddress];
      }

      /**
       * Mark ws channel local server machine (mac) address.
       * used to auth and correct route in next messages.
       */
      wsChannel.machineMac = certAuth.macAddress;

      /** Hold the channel after auth success. */
      this.localChannelsMap[certAuth.macAddress] = wsChannel;
      updateServerConnection(certAuth.macAddress).catch((err) => {
        logger.info(`Failed to update ${certAuth.macAddress} connection ${inspect(err, false, 3)}`);
      });

      /** Send local server authenticatedSuccessfully message. */
      this.sendMessage(wsChannel, { remoteMessagesType: 'authenticatedSuccessfully', message: {} });

      logger.info(`Local server ${localServer.displayName} connected successfully`);

      // if the version, platform or local IP was changed, update the server meta
      if (localServer.platform !== certAuth.platform
        || localServer.version !== certAuth.version
        || localServer.localIp !== certAuth.localIp
      ) {
        await updateServerMeta(certAuth.macAddress, certAuth.platform, certAuth.version, certAuth.localIp);
      }

      /** Update subscribers with the new local server status */
      this.localServersStatusFeed.next({ localServerId: certAuth.macAddress, theNewStatus: true });
    } catch (error) {
      logger.error(`Fail to authenticate local server '${certAuth.macAddress}' connection request, ${inspect(error, false, 3)}`);

      if (error.message !== 'authenticationFail') {

        /** send generic auth fail message */
        this.sendMessage(wsChannel, {
          remoteMessagesType: 'authenticationFail',
          message: {
            authenticationFail: {
              responseCode: 13501,
              message: 'Remote Server Internal Error',
            },
          },
        });
      }

      /** wait a while until closing, to allow local server process fail message */
      setTimeout(() => {
        try {
          this.localChannelsMap[certAuth.macAddress].close();
        } catch (error) { }
      }, 4000);
    }
  }

  /**
   * Handle feed message arrived from local sercer.
   * @param wsChannel local server ws object that message arrived from.
   * @param localServerFeed feed data.
   */
  private async handleFeedUpdate(wsChannel: CasaWs, localServerFeed: LocalServerFeed) {
    try {
      /** Send feed */
      this.localServersFeed.next({ localServerId: wsChannel.machineMac, localServerFeed });
    } catch (error) {
      logger.warn(`sending feed from local server to clients fail ${JSON.stringify(error)}`);
    }
  }

  /**
   * Handle get registered users of the certain local server.
   * @param wsChannel local server ws object that message arrived from.
   */
  private async handleGetLocalUsers(wsChannel: CasaWs) {
    try {
      /** Get local server based on local server mac */
      const localServer = await getServer(wsChannel.machineMac);

      this.sendMessage(wsChannel, {
        remoteMessagesType: 'registeredUsers',
        message: { registeredUsers: localServer.validUsers },
      });
    } catch (error) {
      logger.warn(`sending to local server his valid users fail ${JSON.stringify(error)}`);
    }
  }

  /**
   * Handle http response messages from local server.
   * @param httpResponse response data.
   */
  private handleHttpResponse(httpResponse: HttpResponse) {
    /** Get request promise methods */
    const sentRequest = this.sentHttpRequestsMap[httpResponse.requestId];

    /** If timeout activation delete it. there is nothing else to do. */
    if (!sentRequest) {
      /** Too late... */
      return;
    }

    /** Remove request promise from map */
    delete this.sentHttpRequestsMap[httpResponse.requestId];

    /** Activate promise resolve method with response as is. */
    sentRequest.forwardPromise.resolve(httpResponse);
  }

  /**
   * Handle http response messages from local server.
   * @param httpResponse response data.
   */
  private handleLogsResponse(localServerId: string, data: string) {
    /** Get request promise methods */
    const sentRequest = this.fetchLocalLogsMap[localServerId];

    /** If timeout activation delete it. there is nothing else to do. */
    if (!sentRequest) {
      /** Too late... */
      return;
    }

    /** Remove request promise from map */
    delete this.fetchLocalLogsMap[localServerId];

    /** Activate promise resolve method with response as is. */
    sentRequest.forwardPromise.resolve(data);
  }

  /**
   * Send register authentication code to email account.
   * @param userForwardRequest email account to send for.
   */
  private async handleSendRegistrationCodeRequest(userForwardRequest: { email: string }) {
    const { email } = userForwardRequest;

    /** Generate random MFA key. */
    const code = randomstring.generate({
      charset: 'numeric',
      length: 6,
    });

    try {
      await SendMail(email, code);
      this.forwardUserReqAuth[email] = {
        code,
        timestamp: new Date().getTime(),
      };
    } catch (error) {
      logger.warn(`Sent auth user account for local server forwarding fail ${JSON.stringify(error)}`);
    }
  }

  /**
   * Register account to allow forward HTTP requests from remote to local server
   * @param wsChannel The local server ws channel to add account for.
   * @param userForwardRequest The request data
   */
  private async handleRegisterAccountRequest(wsChannel: CasaWs, userForwardRequest: { email: string; code: string }) {
    const { email, code } = userForwardRequest;

    if (
      this.forwardUserReqAuth[email] &&
      this.forwardUserReqAuth[email].code === code &&
      new Date().getTime() - this.forwardUserReqAuth[email].timestamp < momoent.duration(5, 'minutes').asMilliseconds()
    ) {
      delete this.forwardUserReqAuth[email];

      try {
        const localServer = await getServer(wsChannel.machineMac);
        if (localServer.validUsers.indexOf(email) === -1) {
          localServer.validUsers.push(email);
          await updateServer(localServer);
        }

        this.sendMessage(wsChannel, {
          remoteMessagesType: 'registerUserResults',
          message: {
            registerUserResults: {
              user: email,
            },
          },
        });
      } catch (error) {
        logger.warn(`Registar user account for local server forwarding fail ${JSON.stringify(error)}`);
        this.sendMessage(wsChannel, {
          remoteMessagesType: 'registerUserResults',
          message: {
            registerUserResults: {
              user: email,
              results: {
                responseCode: 5001,
              },
            },
          },
        });
      }
      return;
    }

    this.sendMessage(wsChannel, {
      remoteMessagesType: 'registerUserResults',
      message: {
        registerUserResults: {
          user: email,
          results: {
            message: 'user or code invalied',
            responseCode: 6403,
          },
        },
      },
    });
  }

  /**
   * Remove account from local server valid account to forward from remote to local
   * @param wsChannel The local server ws channel to remove from.
   * @param userForwardRequest The account to remove.
   */
  private async handleUnregisterAccountRequest(wsChannel: CasaWs, userForwardRequest: { email: string }) {
    const { email } = userForwardRequest;

    try {
      const localServer = await getServer(wsChannel.machineMac);
      if (localServer.validUsers.indexOf(email) !== -1) {
        localServer.validUsers.splice(localServer.validUsers.indexOf(email), 1);
        await updateServer(localServer);
      }

      this.sendMessage(wsChannel, {
        remoteMessagesType: 'registerUserResults',
        message: {
          registerUserResults: {
            user: email,
          },
        },
      });
    } catch (error) {
      logger.warn(`Unegistar user account for local server forwarding fail ${JSON.stringify(error)}`);
      this.sendMessage(wsChannel, {
        remoteMessagesType: 'registerUserResults',
        message: {
          registerUserResults: {
            user: email,
            results: {
              responseCode: 5001,
            },
          },
        },
      });
    }
  }

  /**
   * Send remote message to local server.
   * @param wsChannel ws to send by.
   * @param remoteMessage message to send.
   */
  private sendMessage(wsChannel: ws, remoteMessage: RemoteMessage) {
    try {
      wsChannel.send(JSON.stringify(remoteMessage));
    } catch (error) { }
  }
}

export const ChannelsSingleton = new Channels();
