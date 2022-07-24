import { NextFunction, Request, Response } from 'express';
import * as express from 'express';
import { FeedController } from '../controllers/feed-controller';
import { logger } from '../logger';
import { ForwardSession } from '../models';
import { ErrorResponse, Login, User } from '../models/sharedInterfaces';
import { expressAuthentication, SystemAuthScopes, USER_AUTHENTICATION_HEADER } from '../security/authentication';

export class FeedRouter {
  private feedController: FeedController = new FeedController();

  public routes(app: express.Express): void {
    app.get('/API/feed/*', async (request: express.Request, response: express.Response, next: NextFunction) => {
      // WA to fix deprecated flush, see https://github.com/dpskvn/express-sse/issues/28
      const originalRespond = response as any;
      originalRespond.flush =
        originalRespond.flush ||
        (() => {
          /* Do nothing */
        });

      /**
       * Allow send the authentication key via query in SSE (only)
       * - used when not using cookies but authentication header as authorization for REST request
       */
      if (request.query[USER_AUTHENTICATION_HEADER]) {
        request.headers[USER_AUTHENTICATION_HEADER] = request.query[USER_AUTHENTICATION_HEADER] as any;
      }

      next();
    });

    app.get('/API/feed/minions', async (request: express.Request, response: express.Response) => {
      try {
        /**
         * Make sure it is valid local server user with valid session.
         */
        const forwardUserSession = (await expressAuthentication(request, [
          SystemAuthScopes.forwardScope,
        ])) as ForwardSession;

        this.feedController.initMinionsFeed(forwardUserSession.server, request, response);
      } catch (error) {
        response.status(401).send();
      }
    });

    app.get('/API/feed/timings', async (request: express.Request, response: express.Response) => {
      try {
        /**
         * Make sure it is valid local server user with valid session.
         */
        const forwardUserSession = (await expressAuthentication(request, [
          SystemAuthScopes.forwardScope,
        ])) as ForwardSession;

        this.feedController.initTimingsFeed(forwardUserSession.server, request, response);
      } catch (error) {
        response.status(401).send();
      }
    });
  }
}
