# CASANET remote server.

## For what?
The [casanet server](https://github.com/casanet/casanet-server) is running on the local network. 
so to access casa-net API outside the home we need to know our home public IP address and configure port forwarding in-home router.

But it not so easy, because some of ISP services giving NAT IP and not public IP, and some other replacing IP addresses each connection,
also for port forwarding, the computer needs to use a static IP address in a local network.

### The solution:
The remote server is built to run on a cloud so the local casa-net server will connect to it via [ws](https://www.w3.org/TR/websockets/),
and each user request will redirect to the local server.

The WS connection used only to redirect requests,
and in the local server, it will be converted back to an HTTP request and authentication and handled like each other HTTP request.

One remote server can manage and redirect API calls to many local servers,
the redirection to correct local server is based on valid users list of eatch local server, all email accounts in that list verified by the remote server with registration code, before adding them to the collection or added manualy by remote server administrator.

If the user email exists in more then one local server valid users you will need in login request to select a local server to try redirect to.

> Note that remote server not keeping or snooping any data, 
all requests send after session checking AS IS to the local server. (except user session key hash).

Simple diagram:
![Screenshot](./docs/images/remote-diagram.png)

### Remote server installation:
1. Download the project via git or download files as a zip.
1. Install Node.js on the machine.
1. Navigate in a command line to `$/remote-server` and press `npm ci`.
1. Press `node dist/index.js` to run the server.

### Configuration

The configuration is based on environment variable.

All vaiables with example value placed in [.env.example](./.env.example) file.

You can load the environment using .`env` file.

### Secret keys

Define variable named `JWT_SECRET` with secret string to sign sessions.
You can defain `ADMIN_JWT_EXPIRES_IN` (the default is '2 days') and `FORWARD_JWT_EXPIRES_IN` (the default is '360 days'). 

### App behind proxy
When deploying an app to some services (Heroku, AWS, etc) the app runs behind a proxy.
To tell the app to trust the proxy set `APP_BEHIND_PROXY` env var to `true`.
And to redirect HTTP request to HTTPS set `APP_BEHIND_PROXY_REDIRECT_HTTPS` env var to `true`.

### Allow cors for the frontend apps
To allow the management dashboard app to access remote server API set `ALLOW_MANAGEMENT_ORIGIN` with the origin URL of the management app (default is 'http://127.0.0.1:8080'). 

And set `ALLOW_DASHBOARD_ORIGIN` for the user's dashboard origin URL app (default is 'http://127.0.0.1:8081').

In addition, if the frontend app running on a different domain then server, set `SAME_SITE_POLICY` to be false, otherways the browser restricts to send the session to the server. see cookies [SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie).

Note the risk of allowing session cookie to send for other domains. 
This is why the default value for `SAME_SITE_POLICY` is true.

### Send mail account
To send email (for MFA and notifications) the server needs to use a mail account access.

See in the casanet server [Two factor authentication](https://github.com/casanet/casanet-server/tree/development/backend#two-factor-authentication-mfa) section, how to configure it.

### Configure database

Install locally:

Define local variable named `DATABASE_URL` of the form `postgres://user:pass@localhost:5432/casanet_db`

1. Create Database and User:

   ```bash
   $ psql postgres
   CREATE ROLE casanet WITH LOGIN PASSWORD 'yourpass';
   ALTER ROLE casanet CREATEDB;

   $ psql postgres -U casanet
   CREATE DATABASE casanet_db;
   GRANT ALL PRIVILEGES ON DATABASE casanet_db TO casanet;
   ```
   
2. Run migrations to create tables:

   ```bash
   npm run migrate

   # to revert the last migration
   npm run migrate:revert
   ```

## Pair local server with remote server:
1) In local server login as admin and get machine mac address (In side bar, `get physical address`). 
1) In remote server login to management as admin and create a new local server (POST /servers).
1) In remote server get local server id (GET /servers).
1) In remote server generate key for local server (POST /servers/auth/{localServerId}).
1) In local server set remote server settings with remote server URI (`ws://remote-server-domain/` or `wss://remote-server-domain/` case using HTTPS)
and the generated key (PUT /remote).
1) In local server route to users and start "register user to remote server" process.
1) That's it, now you can access local server API via the remote server.

## Remote server API
The [remote dashboard](https://github.com/casanet/remote-dashboard) wraping the administration API. 

The full specs of API are documented in [swagger API file](./swagger.yaml).
