/**
 * Express module
 * @module express/module
 */

/**
 * Module main class
 */
class ExpressModule {
    /**
     * Create the module
     * @param {App} app                                     The application
     * @param {object} config                               Configuration
     */
    constructor(app, config) {
        this._app = app;
        this._config = config;
    }

    /**
     * Service name is 'modules.express'
     * @type {string}
     */
    static get provides() {
        return 'modules.express';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
        ];
    }
}

module.exports = ExpressModule;
