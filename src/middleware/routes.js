/**
 * Module-defined routes middleware
 * @module express/middleware/routes
 */

/**
 * Module-provided routes
 */
class Routes {
    /**
     * Create the service
     * @param {Map} modules             Loaded application modules
     */
    constructor(modules) {
        this._modules = modules;
    }

    /**
     * Service name is 'express.routes'
     * @type {string}
     */
    static get provides() {
        return 'express.routes';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'modules' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        for (let router of server.routers)
            server.express.use('/', router);
    }
}

module.exports = Routes;
