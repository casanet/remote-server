import { Request, Response } from 'express';
import * as Joi from 'joi';
import { JoiObject, ObjectSchema, ValidationResult } from 'joi';
import { logger } from '../logger';
import { ErrorResponse } from '../models/sharedInterfaces';

export const createUserSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    displayName: Joi.string()
      .allow('')
      .max(30)
      .required(),
    password: Joi.string()
      .not('')
      .min(8)
      .required(),
    ignoreTfa: Joi.boolean().required(),
  })
  .required();

export const updateUserSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    displayName: Joi.string()
      .allow('')
      .max(30)
      .required(),
    password: Joi.string().allow(''),
    ignoreTfa: Joi.boolean().required(),
  })
  .required();

export const serverSchema: ObjectSchema = Joi.object()
  .keys({
    macAddress: Joi.string()
      .not('')
      .length(12)
      .required(),
    displayName: Joi.string()
      .allow('')
      .max(30)
      .required(),
    contactMail: Joi.string()
      .email()
      .allow('')
      .max(150),
    validUsers: Joi.array()
      .items(Joi.string().email())
      .required(),
    platform: Joi.allow(''), // Block UI from it
    version: Joi.allow(''), // Block UI from it
    comment: Joi.string()
      .max(1000)
      .allow(''),
  })
  .required();

export const IftttAuthRequestSchema: ObjectSchema = Joi.object()
  .keys({
    localMac: Joi.string()
      .not('')
      .length(12)
      .required(),
    apiKey: Joi.string()
      .not('')
      .required(),
  })
  .required();

export const IftttOnChangedSchema: ObjectSchema = Joi.object()
  .keys({
    localMac: Joi.string()
      .not('')
      .length(12)
      .required(),
    deviceId: Joi.string()
      .not('')
      .required(),
    newStatus: Joi.string()
      .allow('on', 'off')
      .required(),
  })
  .required();

export const LoginLocalServerSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .not('')
      .required(),
    localServerId: Joi.string().allow(''),
  })
  .required();

export const LoginTfaLocalServerSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    mfa: Joi.string()
      .not('')
      .required(),
    localServerId: Joi.string().allow(''),
  })
  .required();

export const LoginSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .not('')
      .required(),
  })
  .required();

export const LoginMfaSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .not('')
      .required(),
    mfaCode: Joi.string()
      .length(6)
      .required(),
  })
  .required();

const forwardAccountSchema: ObjectSchema = Joi.object().keys({
  email: Joi.string()
    .email()
    .required(),
});

const registerAccountSchema: ObjectSchema = Joi.object().keys({
  email: Joi.string()
    .email()
    .required(),
  code: Joi.string()
    .length(6)
    .required(),
});

const initSchema = Joi.object().keys({
  macAddress: Joi.string()
    .not('')
    .length(12)
    .required(),
  remoteAuthKey: Joi.string()
    .not('')
    .required(),
  platform: Joi.string()
    .not('')
    .required(),
  version: Joi.string()
    .not('')
    .required(),
});

const httpResponseSchema = Joi.object().keys({
  requestId: Joi.string()
    .not('')
    .required(),
  httpStatus: Joi.number()
    .integer()
    .required(),
  httpBody: Joi.any(),
  httpSession: Joi.object().keys({
    key: Joi.string()
      .not('')
      .required(),
    maxAge: Joi.number().required(),
  }),
  httpHeaders: Joi.object().pattern(/^/, Joi.alt(Joi.string(), Joi.array().items(Joi.string()))),
});

const emptyMessageSchema = Joi.object().keys({});

const feedSchema = Joi.object().keys({
  feedType: Joi.valid('minions', 'timings').required(),
  feedContent: Joi.any().required(),
});

export const LocalMessageSchema: ObjectSchema = Joi.object()
  .keys({
    localMessagesType: Joi.valid(
      'initialization',
      'sendRegistrationCode',
      'unregisterAccount',
      'registerAccount',
      'registeredUsers',
      'httpResponse',
      'ack',
      'feed',
      'logs',
    ).required(),
    message: Joi.alternatives()
      .when('localMessagesType', {
        is: 'initialization',
        then: Joi.object()
          .keys({ initialization: initSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'sendRegistrationCode',
        then: Joi.object()
          .keys({ sendRegistrationCode: forwardAccountSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'unregisterAccount',
        then: Joi.object()
          .keys({ unregisterAccount: forwardAccountSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'registerAccount',
        then: Joi.object()
          .keys({ registerAccount: registerAccountSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'registeredUsers',
        then: emptyMessageSchema.required(),
      })
      .when('localMessagesType', {
        is: 'httpResponse',
        then: Joi.object()
          .keys({ httpResponse: httpResponseSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'ack',
        then: emptyMessageSchema.required(),
      })
      .when('localMessagesType', {
        is: 'feed',
        then: Joi.object()
          .keys({ feed: feedSchema.required() })
          .required(),
      })
      .when('localMessagesType', {
        is: 'logs',
        then: Joi.object()
          .keys({
            logs: Joi.string()
              .base64()
              .required(),
          })
          .required(),
      }),
  })
  .required();

// COPY FROM HERE
export const RemoteSettingsSchema: ObjectSchema = Joi.object()
  .keys({
    host: Joi.string()
      .uri()
      .regex(/^(ws:\/\/|wss:\/\/)/)
      .required(),
    connectionKey: Joi.string()
      .not('')
      .required(),
  })
  .required();

export const UserSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    displayName: Joi.string()
      .not('')
      .required(),
    password: Joi.string()
      .not('')
      .min(6)
      .max(18)
      .required(),
    ignoreTfa: Joi.boolean().required(),
    scope: Joi.allow('adminAuth', 'userAuth').required(),
  })
  .required();

export const UserUpdateSchema: ObjectSchema = Joi.object()
  .keys({
    email: Joi.string()
      .email()
      .required(),
    displayName: Joi.string()
      .not('')
      .required(),
    password: Joi.string()
      .allow('')
      .min(6)
      .max(18),
    ignoreTfa: Joi.boolean().required(),
    scope: Joi.allow('adminAuth', 'userAuth'),
  })
  .required();

export const ErrorResponseSchema: ObjectSchema = Joi.object()
  .keys({
    responseCode: Joi.number()
      .min(4000)
      .max(5999)
      .required(),
    message: Joi.string().not(''),
  })
  .required();

/**
 * Get request client IP.
 */
export const GetIp = (req: Request): string => {
  let ip = req.headers['x-forwarded-for'] as string;
  if (ip) {
    const ipParts = ip.split(',');
    ip = ipParts[ipParts.length - 1];
  } else {
    ip = req.connection.remoteAddress;
  }
  return ip;
};

/**
 * Validate the req.body json by given scema
 * If fail, reject with code 422.
 * Else return the object after clean.
 * @param {Request} req The express req object
 * @param {JoiObject} schema The Joi schema object
 * @returns {Promise<any|ErrorResponse>} Promise when seccess with cleaned data.
 */
export const RequestSchemaValidator = async (req: Request, schema: JoiObject): Promise<any | ErrorResponse> => {
  return await SchemaValidator(req.body, schema).catch((result: ValidationResult<any>) => {
    logger.warn(`wrong scema data rrrived ` + `from ${GetIp(req)}, error: ${result.error.message}`);
    const error: ErrorResponse = {
      responseCode: 2422,
      message: result.error.message,
    };

    throw error;
  });
};

/**
 * Validate json by given scema
 * If fail, reject with error message.
 * Else return the object after clean.
 * @param {Request} req The express req object
 * @param {JoiObject} schema The Joi schema object
 */
export const SchemaValidator = async (data: any, scema: JoiObject): Promise<any | ValidationResult<any>> => {
  const result: ValidationResult<any> = Joi.validate(data, scema);
  if (!result.error) {
    return result.value;
  }

  throw result;
};
