import * as jwt from 'jsonwebtoken';
import * as momoent from 'moment';
import * as randomstring from 'randomstring';
import { Body, Controller, Delete, Get, Header, Path, Post, Put, Request, Response, Route, Security, SuccessResponse, Tags } from 'tsoa';
import { Configuration } from '../config';
import { checkAdminAccess } from '../data-access';
import { logger } from '../logger';
import { SendMail } from '../mailSender';
import { RemoteAdmin } from '../models';
import { ErrorResponse, Login, LoginMfa } from '../models/sharedInterfaces';
import { jwtSecret } from '../security/authentication';
import { LoginSchema, LoginMfaSchema, SchemaValidator } from '../security/schemaValidator';

const jwtExpiresIn = process.env.ADMIN_JWT_EXPIRES_IN || '2 days';

declare interface TfaData {
    generatedKey: string;
    timeStamp: Date;
}

const tfaLogins: { [key: string]: TfaData } = {};

/**
 * Manage admins authentication in system.
 */
@Tags('Administration')
@Route('/administration/auth')
export class AdministrationAuthController extends Controller {

    private async activeSession(admin: RemoteAdmin): Promise<void> {

        const token = jwt.sign(
            {
                email: admin.email,
            },
            jwtSecret,
            {
                expiresIn: jwtExpiresIn,
            },
        );
        /**
         * Finally load session on cookies response.
         */
        // tslint:disable-next-line:max-line-length
        this.setHeader('Set-Cookie', `session=${token}; Max-Age=${2.592e+6}; Path=/; HttpOnly; ${Configuration.http.useHttps || process.env.APP_BEHIND_PROXY_REDIRECT_HTTPS ? 'Secure' : ''}; SameSite=${process.env.SAME_SITE_POLICY !== 'false' ? 'Strict' : 'None' };`);
    }

    /**
     * Login to the administration system.
     */
    @Response<void>(201, '2-fatore code sent')
    @Response<ErrorResponse>(501, 'Server error')
    @Response<ErrorResponse>(403, 'Auth fail')
    @Response<ErrorResponse>(422, 'Invalid schema')
    @Post('login')
    public async administrationLogin(@Body() login: Login): Promise<void> {
        try {
            login = await SchemaValidator(login, LoginSchema);
        } catch (err) {
            this.setStatus(422);
            return err.error.message;
        }

        const admin = await checkAdminAccess(login);

        if (!admin) {
            this.setStatus(401);
            return;
        }

        /** Case user not require MFA, the login prossess done. */
        if (admin.ignoreTfa) {
            return await this.activeSession(admin);
        }

        /** Case user require MFA but email account not properly sets, send error message about it. */
        if (!Configuration.twoStepsVerification.TwoStepEnabled) {
            logger.warn(`User try to login but there is no support in tfa right now`);
            this.setStatus(501);
            return;
        }

        /** Generate random MFA key. */
        const tfaKey = randomstring.generate({
            charset: 'numeric',
            length: 6,
        });

        try {
            /** Try to send MFA key to user email. */
            await SendMail(admin.email, tfaKey);
        } catch (error) {
            /** Case sending fail leet hime know it. */
            logger.error(`Mail API problem, ${error.message}`);
            this.setStatus(501);
            return;
        }

        /** Map generated key to user. */
        tfaLogins[admin.email] = {
            generatedKey: tfaKey,
            timeStamp: new Date(),
        };

        /** Mark status to 201, means, the login is OK but needs extra, MFA. */
        this.setStatus(201);
    }

    /**
     * 2-step verification login to the administration system.
     */
    @Response<ErrorResponse>(501, 'Server error')
    @Response<ErrorResponse>(403, 'Auth fail')
    @Response<ErrorResponse>(422, 'Invalid schema')
    @Post('login/tfa')
    public async administrationLoginTfa(@Body() login: LoginMfa): Promise<void> {
        try {
            login = await SchemaValidator(login, LoginMfaSchema);
        } catch (err) {
            this.setStatus(422);
            return err.error.message;
        }

        /** Get MFA key if exists */
        const tfaData = tfaLogins[login.email];

        /**
         * If user request MFA in last 5 minutes, and MFA key same as generated, let user pass.
         */
        if (tfaData &&
            tfaData.generatedKey === login.mfaCode &&
            new Date().getTime() - tfaData.timeStamp.getTime() < momoent.duration(5, 'minutes').asMilliseconds()) {
            const admin = await checkAdminAccess(login);

            if (!admin) {
                this.setStatus(401);
                return;
            }

            delete tfaLogins[login.email];
            return await this.activeSession(admin);
        }

        /** Any other case, return generic error. */
        this.setStatus(401);
    }

    /**
     * Logout manually from the administration system.
     */
    @Security('adminAuth')
    @Response<ErrorResponse>(501, 'Server error')
    @Post('logout')
    public async administrationLogout(): Promise<void> {
        /** Currently there is no blacklist of invalid tokens */

        /** Send clean session by response to client browser. */
        this.setHeader('Set-Cookie', `session=0;  Path=/;`);

    }
}
