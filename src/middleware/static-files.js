/**
 * Static files middleware
 * @module express/middleware/static-files
 */
const path = require('path');
const express = require('express');

/**
 * Module-provided static files
 */
class StaticFiles {
    /**
     * Create the service
     * @param {object} config           Configuration
     */
    constructor(config) {
        this._config = config;
    }

    /**
     * Service name is 'express.staticFiles'
     * @type {string}
     */
    static get provides() {
        return 'express.staticFiles';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        for (let [ moduleName, moduleConfig ] of this._config.modules) {
            for (let dir of moduleConfig.static || []) {
                let filename = dir[0] === '/'
                    ? dir
                    : path.join(this._config.base_path, 'modules', moduleName, dir);
                server.express.use(express.static(filename));
            }
        }
    }
}

module.exports = StaticFiles;
