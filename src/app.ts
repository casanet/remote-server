import axios from 'axios';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as forceSsl from 'express-force-ssl';
import * as rateLimit from 'express-rate-limit';
import * as fse from 'fs-extra';
import { sanitizeExpressMiddleware } from 'generic-json-sanitizer';
import * as helmet from 'helmet';
import * as swaggerUi from 'swagger-ui-express';
import { Configuration } from './config';
import { RegisterRoutes } from './generated/routes';
import { logger } from './logger';
import { FeedRouter } from './routers/feedRoute';
import { ForwardingIftttRouter } from './routers/forwardingsIftttRoute';
import { ForwardingRouter } from './routers/forwardingsRoute';

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

    /** Finally route API of casa and forward it as is to local server */
    this.forwardingToLocal();

    /** Serve Swagger UI spec */
    this.serverDocs();

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
      const xfp = req.headers['X-Forwarded-Proto'] || req.headers['x-forwarded-proto'];
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
    const { ALLOW_DASHBOARD_ORIGINS } = process.env;

    // Get the domains (separated by ',') or use the default domains
    const whitelist = ALLOW_DASHBOARD_ORIGINS
      ? ALLOW_DASHBOARD_ORIGINS.split(',')
      : ['http://127.0.0.1:8080', 'http://127.0.0.1:8081'];

    logger.info('Opening CORS for the following origins:');
    // tslint:disable-next-line: no-console
    console.table(whitelist);
    this.express.use(
      cors({
        credentials: true,
        origin: (origin, callback) => {
          /** If origin not sent (mean it`s same origin) or origin match white list, allow it. */
          if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
          } else {
            callback(new Error(`${origin} not allowed by CORS`));
          }
        },
      }),
    );

    // Security
    this.express.get('/.well-known/security.txt', (req, res) => {
      res.setHeader('Content-type', 'application/octet-stream');
      res.setHeader('Content-disposition', 'attachment; filename=security.txt');
      res.send(`
                This server build by an open-source project at https://github.com/casanet/remote-server .
                If you would like to report a security issue in the code-base please open an issue in the repository,
                or contact me directly via my profile https://github.com/haimkastner .
                Thanks!
            `);
    });
  }

  /**
   * Parse request query and body.
   */
  private dataParsing(): void {
    this.express.use(cookieParser()); // Parse every request cookie to readable json.

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

  private serverDocs(): void {
    this.express.get('/docs/local/swagger.json', async (req, res, next) => {
      try {
        // Fetch local Casanet spec
        const allSpecsRes = await axios.get(`https://api.swaggerhub.com/apis/haimkastner/casanet-local-server`);

        const allSpecs = allSpecsRes.data;
        // Get the latest API available
        const latestVersionInfo = allSpecs.apis[allSpecs.apis.length - 1];

        // Find the SWagger property, where there is the URL to the spec
        const latestVersionUrl = latestVersionInfo.properties.find(prop => prop.type === 'Swagger')?.url;

        const latestSpecRes = await axios.get(latestVersionUrl);

        const spec = latestSpecRes.data;

        // Set the host to be self
        spec.servers = [
          {
            url: `http${req.secure ? 's' : ''}://${req.headers.host || req.hostname}`
          },
        ];
        res.json(spec);
      } catch (error) {
        logger.error(`Unable to fetch latest local Casanet spec ${error.message}`);
        next('Unable to fetch latest local Casanet spec');
      }
    });
    this.express.get('/docs/remote/swagger.json', async (req, res, next) => {
      try {
        // Load remote Casanet spec
        const resSpec = await fse.promises.readFile('./src/generated/swagger.json');
        const spec = JSON.parse(resSpec.toString('utf-8')) as any;
        // Set the host to be self
        spec.host = req.headers.host || req.hostname;
        spec.schemes = [ `http${req.secure ? 's' : ''}` ];
        res.json(spec);
      } catch (error) {
        logger.error(`Unable to load remote Casanet spec, ${error.message}`);
        next('Unable to load remote Casanet spec');
      }
    });
    const casanetSpecOptions: swaggerUi.SwaggerUiOptions = {
      explorer: true,
      swaggerOptions: {
        urls: [
          {
            // Send the local swagger serve route for the local
            url: '/docs/local/swagger.json',
            name: 'Casanet Local Server',
          },
          {
            // Send the remote swagger serve route for the local
            url: '/docs/remote/swagger.json',
            name: 'Casanet Remote Server',
          },
        ],
      },
    };
    this.express.use('/docs', swaggerUi.serve, swaggerUi.setup(null, casanetSpecOptions));
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
        logger.warn(
          `express route crash,  req: ${req.method} ${req.path} error: ${err.message} body: ${JSON.stringify(
            req.body,
          )}`,
        );
      } catch (error) {
        logger.warn(`Ok... even the crash route catcher crashd...`);
      }
      res.status(500).send();
    });
  }
}

export default new App().express;
