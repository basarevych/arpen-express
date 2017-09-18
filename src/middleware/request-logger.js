/**
 * HTTP request logging middleware
 * @module express/middleware/request-logger
 */
const morgan = require('morgan');

/**
 * Request logger
 */
class RequestLogger {
    /**
     * Create the service
     * @param {App} app                 Application
     * @param {object} config           Configuration
     * @param {object} logStreams       Log streams
     */
    constructor(app, config, logStreams) {
        this._app = app;
        this._config = config;
        this._logStreams = logStreams;
    }

    /**
     * Service name is 'express.requestLogger'
     * @type {string}
     */
    static get provides() {
        return 'express.requestLogger';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'logger.streams' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        server.express.use(morgan('dev'));

        let stream = this._logStreams.logs.get('access');
        if (stream)
            server.express.use(morgan('combined', { stream: stream.stream }));
    }
}

module.exports = RequestLogger;
