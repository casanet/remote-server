import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as forceSsl from 'express-force-ssl';
import * as rateLimit from 'express-rate-limit';
import { sanitizeExpressMiddleware } from 'generic-json-sanitizer';
import * as helmet from 'helmet';
import { Configuration } from './config';
import { logger } from './logger';
import { FeedRouter } from './routers/feedRoute';
import { ForwardingIftttRouter } from './routers/forwardingsIftttRoute';
import { ForwardingRouter } from './routers/forwardingsRoute';
import { RegisterRoutes } from './routers/routes';

// controllers need to be referenced in order to get crawled by the TSOA generator
import './controllers/administration-admins-controller';
import './controllers/administration-auth-controller';
import './controllers/feed-controller';
import './controllers/forward-auth-controller';
import './controllers/local-servers-controller';
import './controllers/management-assets-controller';
import './controllers/static-assets-controller';

const { APP_BEHIND_PROXY, APP_BEHIND_PROXY_REDIRECT_HTTPS } = process.env;

class App {
    public express: express.Express;
    private feedRouter: FeedRouter = new FeedRouter();
    private forwardingRouter: ForwardingRouter = new ForwardingRouter();
    private forwardingIftttRouter: ForwardingIftttRouter = new ForwardingIftttRouter();

    constructor() {
        /** Creat the express app */
        this.express = express();

        /** Take care with app that runs behind proxy (Heroku, Nginx, etc) */
        if (APP_BEHIND_PROXY === 'true') {
            this.appBehindProxy();
        }

        /** Security is the first thing, right?  */
        this.vulnerabilityProtection();

        /** Parse the request */
        this.dataParsing();

        /** After data parsed, sanitize it. */
        this.sanitizeData();

        /** Route inner system */
        this.routes();

        /** Finaly route API of casa and forward it as is to local server */
        this.forwardingToLocal();

        /** And never sent errors back to client. */
        this.catchErrors();
    }

    /**
     * Route requests to API.
     */
    private routes(): void {

        /** Route local systems system feed */
        this.feedRouter.routes(this.express);

        /** Use generated routers (by TSOA) */
        RegisterRoutes(this.express);
    }

    /**
     * Forward each casa API request to user local server AS IS.
     */
    private forwardingToLocal(): void {
        this.forwardingIftttRouter.forwardRouter(this.express);
        this.forwardingRouter.forwardRouter(this.express);
    }

    /**
     * Take care with app that runs behind proxy (Heroku, Nginx, etc).
     * mark proxy as trust, and redirect to HTTPS if need.
     */
    private appBehindProxy() {
        this.express.set('trust proxy', 1);

        if (APP_BEHIND_PROXY_REDIRECT_HTTPS !== 'true') {
            return;
        }

        /** Redirect to https behaind proxy / elastic load balancer */
        this.express.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            const xfp =
                req.headers['X-Forwarded-Proto'] || req.headers['x-forwarded-proto'];
            if (xfp === 'http') {
                res.redirect(301, `https://${req.hostname}${req.url}`);
            } else {
                next();
            }
        });
    }

    /**
     * Protect from many vulnerabilities ,by http headers such as HSTS HTTPS redirect etc.
     */
    private vulnerabilityProtection(): void {

        // Protect from DDOS and access thieves
        const limiter = rateLimit({
            windowMs: Configuration.requestsLimit.windowsMs,
            max: Configuration.requestsLimit.maxRequests,
        });

        //  apply to all  IP requests
        this.express.use(limiter);

        // Protect authentication API from guessing username/password.
        const authLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 20,
        });
        // apply to all authentication requests
        this.express.use('/API/administration/auth/**', authLimiter);

        // Use to redirect http to https/ssl
        if (Configuration.http.useHttps) {
            this.express.use(forceSsl);
        }

        // Use to redirect http to https/ssl
        if (Configuration.http.useHttps) {
            this.express.use(forceSsl);
        }

        // Protect from XSS and other malicious attacks
        this.express.use(helmet());
        this.express.use(helmet.frameguard({ action: 'deny' }));

        // Open CORS to let frontend apps API access.
        const whitelist = [
            process.env.ALLOW_MANAGEMENT_ORIGIN || 'http://127.0.0.1:8080',
            process.env.ALLOW_DASHBOARD_ORIGIN || 'http://127.0.0.1:8081',
        ];
        logger.info('Openning CORS for the following origins:');
        console.table(whitelist);
        this.express.use(cors({
            credentials: true,
            origin: (origin, callback) => {
                /** If origin not sent (mean it`s same origin) or origin match white list, allow it. */
                if (!origin || whitelist.indexOf(origin) !== -1) {
                    callback(null, true);
                } else {
                    callback(new Error(`${origin} not allowed by CORS`));
                }
            },
        }));
    }

    /**
     * Parse request query and body.
     */
    private dataParsing(): void {
        this.express.use(cookieParser()); // Parse every request cookie to readble json.

        this.express.use(bodyParser.json({ limit: '2mb' })); // for parsing application/json
    }

    /**
     * Sanitize Json schema arrived from client.
     * to avoid stored XSS issues.
     */
    private sanitizeData(): void {
        this.express.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            sanitizeExpressMiddleware(req, res, next, {
                allowedAttributes: {},
                allowedTags: [],
            });
        });
    }

    /**
     * Catch any Node / JS error.
     */
    private catchErrors() {

        // Unknowon routing get 404
        this.express.use('*', (req, res) => {
            res.statusCode = 404;
            res.send();
        });

        /**
         * Production error handler, no stacktraces leaked to user.
         */
        this.express.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                logger.warn(`express route crash,  req: ${req.method} ${req.path} error: ${err.message} body: ${JSON.stringify(req.body)}`);
            } catch (error) {
                logger.warn(`Ok... even the crash route catcher crashd...`);
            }
            res.status(500).send();
        });
    }
}

export default new App().express;
