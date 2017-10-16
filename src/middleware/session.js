/**
 * Session middleware
 * @module express/middleware/session
 */

/**
 * User session
 */
class Session {
    /**
     * Create the service
     * @param {App} app                         The application
     * @param {object} config                   Configuration
     * @param {Logger} logger                   Logger service
     * @param {Session} session                 Session service
     */
    constructor(app, config, logger, session) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._session = session;
    }

    /**
     * Service name is 'express.session'
     * @type {string}
     */
    static get provides() {
        return 'express.session';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'logger', 'session' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        let config = this._config.get(`servers.${server.name}.session`);
        if (!config)
            return;

        let bridge = this._app.get(config.bridge, server.name);
        await this._session.addBridge(server.name, bridge);

        server.express.use(async (req, res, next) => {
            req.session = res.locals.session = null;
            req.user = res.locals.user = null;

            let session;
            try {
                let token = req.cookies && bridge.tokenVar && req.cookies[bridge.tokenVar];
                if (token) {
                    let decoded = await this._session.decodeJwt(server.name, token, req);
                    session = decoded.session;
                }
                if (!session)
                    session = await this._session.create(server.name, null, req);
                req.session = res.locals.session = (session && session.payload) || null;
                req.user = res.locals.user = (session && session.user) || null;
            } catch (error) {
                this._logger.error(error);
            }

            let origEnd = res.end;
            res.end = async (...args) => {
                if (session) {
                    session.user = req.user;

                    try {
                        await this._session.update(server.name, session, req);
                        if (this._session.isValid(server.name, session) && bridge.tokenVar) {
                            let token = await this._session.encodeJwt(server.name, session);
                            console.log(token);
                            res.cookie(bridge.tokenVar, token, {
                                maxAge: 365 * 24 * 60 * 60 * 1000,
                                path: '/',
                                httpOnly: false
                            });
                        }
                    } catch (error) {
                        this._logger.error(error);
                    }
                }

                origEnd.apply(res, args);
            };

            next();
        });
    }

    /**
     * Unregister middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async unregister(server) {
        let config = this._config.get(`servers.${server.name}.session`);
        if (!config)
            return;

        await this._session.removeBridge(server.name);
    }
}

module.exports = Session;
