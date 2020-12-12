import * as express from 'express';
import * as jwt from 'jsonwebtoken';
import { Configuration } from '../config';
import { logger } from '../logger';
import { Cache } from '../logic';
import { AuthScopes, ForwardSession } from '../models';
import { ErrorResponse, IftttActionTriggeredRequest } from '../models/sharedInterfaces';
import { IftttAuthRequestSchema, SchemaValidator } from './schemaValidator';

export declare interface SessionPayload {
  email?: any;
  scope: string;
}

export const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  logger.fatal('You must set the jwt secret!');
  process.exit();
}

const RF_REPOSITORY_API_KEY = process.env.RF_REPOSITORY_API_KEY;

/**
 * System auth scopes, shown in swagger doc as 2 kinds of security definitions.
 */
export const SystemAuthScopes: {
  forwardScope: AuthScopes;
  adminScope: AuthScopes;
  iftttScope: AuthScopes;
  rfRepositoryAuth: AuthScopes;
} = {
  forwardScope: 'forwardAuth',
  adminScope: 'adminAuth',
  iftttScope: 'iftttAuth',
  rfRepositoryAuth: 'rfRepositoryAuth',
};

export const forwardCache = new Cache(
  +process.env.FORWARD_CACHE_TTL || 60 * 60 * 2,
  +process.env.FORWARD_CACHE_CHECK_PERIOD || 60 * 60,
);

/**
 * Cert Authentication middleware API.
 * the auth token should be the value of 'session' cookie.
 * @param securityName Used as auth scope beacuse of poor scopes swaggger support in apiKey auth.
 */
export const expressAuthentication = async (
  request: express.Request,
  scopes: string[],
): Promise<string | ForwardSession | ErrorResponse> => {
  // If the routing security sent wrong security scope.
  if (!scopes || scopes.length < 1) {
    logger.fatal('invalid or empty security scope');
    throw {
      responseCode: 1501,
    } as ErrorResponse;
  }

  /** TODO: add cache support */

  /** Handle IFTTT requests */
  if (scopes.indexOf(SystemAuthScopes.iftttScope) !== -1) {
    const { apiKey, localMac } = request.body as IftttActionTriggeredRequest;
    await SchemaValidator({ apiKey, localMac }, IftttAuthRequestSchema);
    return;
  }

  /** Handle Rf commands repo API requests */
  if (scopes.includes(SystemAuthScopes.rfRepositoryAuth)) {
    if (!RF_REPOSITORY_API_KEY) {
      logger.warn('In order to enable the Rf command repo API please set the "RF_REPOSITORY_API_KEY" env var!');
    } else if (RF_REPOSITORY_API_KEY === request.headers['rf-repository-api-key']) {
      return;
    }
    throw {
      responseCode: 1403,
    } as ErrorResponse;
  }

  const jwtSession =
    scopes.indexOf(SystemAuthScopes.adminScope) !== -1 ? request.cookies.admin_session : request.cookies.session;
  /**
   * If the session cookie empty,
   * there is nothing to check.
   */
  if (!jwtSession) {
    throw {
      responseCode: 1403,
    } as ErrorResponse;
  }

  /** Check the session */
  const payload = jwt.verify(jwtSession, jwtSecret) as SessionPayload;

  /** Check the session scope */
  if (scopes.indexOf(payload.scope) !== -1) {
    return payload.scope === SystemAuthScopes.adminScope ? payload.email : payload;
  }

  throw {
    responseCode: 1403,
  } as ErrorResponse;
};
