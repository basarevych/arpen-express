/**
 * Express session bridge service
 * @module express/services/express-session
 */
const geoip = require('geoip-lite');

/**
 * Express session bridge service
 */
class ExpressSession {
    /**
     * Create the service
     * @param {App} app                         The application
     * @param {object} config                   Configuration
     * @param {Logger} logger                   Logger service
     * @param {Util} util                       Util service
     * @param {string} server                   Server name
     */
    constructor(app, config, logger, util, server) {
        this.server = server;

        this._app = app;
        this._config = config;
        this._logger = logger;
        this._util = util;
        this._tokenLength = 64;

        let sessionRepo = this._config.get(`servers.${server}.session.session_repository`);
        if (sessionRepo)
            this._sessionRepo = this._app.get(sessionRepo);

        let userRepo = this._config.get(`servers.${server}.session.user_repository`);
        if (userRepo)
            this._userRepo = this._app.get(userRepo);
    }

    /**
     * Service name is 'expressSession'
     * @type {string}
     */
    static get provides() {
        return 'expressSession';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
            'logger',
            'util',
        ];
    }

    /**
     * Encryption key
     * @type {string}
     */
    get secret() {
        return this._config.get(`servers.${this.server}.session.secret`);
    }

    /**
     * Combine and delay write operations, seconds
     * @type {number}
     */
    get saveInterval() {
        return this._config.get(`servers.${this.server}.session.save_interval`) || 0;
    }

    /**
     * Expiration timeout, seconds
     * @type {number}
     */
    get expirationTimeout() {
        return this._config.get(`servers.${this.server}.session.expire_timeout`) || 0;
    }

    /**
     * Expiration scan interval, seconds
     * @type {number}
     */
    get expirationInterval() {
        return this._config.get(`servers.${this.server}.session.expire_interval`) || 0;
    }

    /**
     * Token variable name (cookie)
     * @type {string}
     */
    get tokenVar() {
        return `sid_${this.server}_${this._config.project}`;
    }

    /**
     * Session token length setter
     * @type {number}
     */
    set tokenLength(length) {
        this._tokenLength = length;
    }

    /**
     * Session token length getter
     * @return {number}
     */
    get tokenLength() {
        return this._tokenLength;
    }

    /**
     * Create session model
     * @param {UserModel|null} user                 User model or null for anonymous session
     * @param {*} [req]                             Express request object
     * @return {Promise}                            Resolves to session model
     */
    async create(user, req) {
        let model = this._config.get(`servers.${this.server}.session.model`);
        let session;
        if (model)
            session = this._app.get(model);
        else if (this._sessionRepo)
            session = this._sessionRepo.getModel();
        else
            throw new Error('No model for the bridge');

        session.token = this._util.getRandomString(this.tokenLength, { lower: true, upper: true, digits: true, special: false });
        session.payload = {};
        session.info = this._getInfo(req);
        session.user = user;
        if (user)
            session.userId = user.id;
        return session;
    }

    /**
     * Find session model
     * @param {string} token                        Session token
     * @param {*} [req]                             Express request object
     * @return {Promise}                            Resolves to session model or null
     */
    async find(token, req) {
        if (!this._sessionRepo)
            return null;

        let sessions = await this._sessionRepo.findByToken(token);
        let session = sessions.length && sessions[0];
        if (!session)
            return null;

        if (session.userId && this._userRepo) {
            let users = await this._userRepo.find(session.userId);
            session.user = (users.length && users[0]) || null;
        }

        if (req)
            session.info = this._getInfo(req);

        return session;
    }

    /**
     * Save session model
     * @param {SessionModel} session                Session model
     * @param {*} [req]                             Express request object
     * @return {Promise}
     */
    async save(session, req) {
        if (req)
            session.info = this._getInfo(req);
        session.userId = session.user ? session.user.id : null;
        if (this._sessionRepo)
            await this._sessionRepo.save(session);
    }

    /**
     * Delete session model
     * @param {SessionModel} session                Session model
     * @return {Promise}
     */
    async destroy(session) {
        if (this._sessionRepo)
            await this._sessionRepo.delete(session);
    }

    /**
     * Delete expired session models
     * @return {Promise}
     */
    async expire() {
        if (this._sessionRepo && this._sessionRepo.deleteExpired)
            await this._sessionRepo.deleteExpired(this.expirationTimeout);
    }

    /**
     * Prepare info object
     * @param {object} req                          Express request data
     * @return {object}
     */
    _getInfo(req) {
        let ip;
        if (req) {
            let ipHeader = this._config.get(`servers.${this.server}.session.ip_header`);
            if (ipHeader)
                ip = req.headers[ipHeader] && req.headers[ipHeader].trim();
            if (!ip)
                ip = req.ip;
        }

        let forwarded = req && req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].trim();
        let agent = req && req.headers['user-agent'] && req.headers['user-agent'].trim();

        return {
            ip: ip || null,
            forwarded_for: forwarded || null,
            user_agent: agent || null,
            geoip: (ip && geoip.lookup(ip)) || null,
        };
    }
}

module.exports = ExpressSession;
