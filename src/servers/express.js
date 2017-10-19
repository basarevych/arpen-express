/**
 * ExpressJS web server
 * @module express/servers/express
 */
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const uuid = require('uuid');
const EventEmitter = require('events');
const NError = require('nerror');

let io;
try {
    io = require('socket.io');
} catch (error) {
    // do nothing
}

/**
 * Express-based server class
 */
class Express extends EventEmitter {
    /**
     * Create the service
     * @param {App} app                     Application
     * @param {object} config               Configuration
     * @param {Filer} filer                 Filer service
     * @param {Logger} logger               Logger service
     */
    constructor(app, config, filer, logger) {
        super();
        this.name = null;
        this.express = null;
        this.routers = [];
        this.server = null;
        this.listening = false;

        this.sockets = new Map();
        this.socketEvents = new Set();

        this._app = app;
        this._config = config;
        this._filer = filer;
        this._logger = logger;
    }

    /**
     * Service name is 'servers.express'
     * @type {string}
     */
    static get provides() {
        return 'servers.express';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'filer', 'logger' ];
    }

    /**
     * Initialize the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async init(name) {
        this.name = name;

        if (this._config.get(`servers.${name}.enable`) === false)
            return;

        this._logger.debug('express', `${this.name}: Initializing express`);
        this.express = express();
        this.express.set('env', this._config.get('env'));
        let options = this._config.get(`servers.${name}.express`);
        for (let option of Object.keys(options)) {
            let name = option.replace('_', ' ');
            let value = options[option];
            this.express.set(name, value);
        }

        let views = [];
        for (let [ moduleName, moduleConfig ] of this._config.modules) {
            for (let view of moduleConfig.views || []) {
                let filename = (view[0] === '/' ? view : path.join(this._config.base_path, 'modules', moduleName, view));
                views.push(filename);
            }
        }
        this.express.set('views', views);

        if (this._config.get(`servers.${name}.ssl.enable`)) {
            let key = this._config.get(`servers.${name}.ssl.key`);
            if (key && key[0] !== '/')
                key = path.join(this._config.base_path, key);
            let cert = this._config.get(`servers.${name}.ssl.cert`);
            if (cert && cert[0] !== '/')
                cert = path.join(this._config.base_path, cert);
            let ca = this._config.get(`server.${name}.ssl.ca`);
            if (ca && ca[0] !== '/')
                ca = path.join(this._config.base_path, ca);

            let promises = [
                this._filer.lockReadBuffer(key),
                this._filer.lockReadBuffer(cert),
            ];
            if (ca)
                promises.push(this._filer.lockReadBuffer(ca));

            let [keyVal, certVal, caVal] = await Promise.all(promises);
            let options = {
                key: keyVal,
                cert: certVal,
            };
            if (caVal)
                options.ca = caVal;

            this.server = https.createServer(options, this.express);
        } else {
            this.server = http.createServer(this.express);
        }

        this.server.on('error', this.onError.bind(this));
        this.server.on('listening', this.onListening.bind(this));

        this.listening = false;

        let middlewareConfig = this._config.get(`servers.${name}.middleware`);
        if (!Array.isArray(middlewareConfig))
            return;

        this._logger.debug('express', `${this.name}: Loading middleware`);
        let middleware;
        if (this._app.has('express.middleware')) {
            middleware = this._app.get('express.middleware');
        } else {
            middleware = new Map();
            this._app.registerInstance(middleware, 'express.middleware');
        }

        return middlewareConfig.reduce(
            async (prev, cur) => {
                await prev;

                let obj;
                if (middleware.has(cur)) {
                    obj = middleware.get(cur);
                } else {
                    obj = this._app.get(cur);
                    middleware.set(cur, obj);
                }

                this._logger.debug('express', `${this.name}: Registering middleware ${cur}`);
                let result = obj.register(this);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Middleware '${cur}' register() did not return a Promise`);
                return result;
            },
            Promise.resolve()
        );
    }

    /**
     * Start the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async start(name) {
        if (name !== this.name)
            throw new Error(`Server ${name} was not properly initialized`);

        if (this._config.get(`servers.${name}.enable`) === false)
            return;

        this._logger.debug('express', `${this.name}: Starting the server`);
        let port = this._normalizePort(this._config.get(`servers.${name}.port`));
        if (this.server && !this.listening) {
            let listen = this.server.listen(port, typeof port === 'string' ? undefined : this._config.get(`servers.${name}.host`));
            if (io) {
                this.io = io.listen(listen);
                this.io.on('connection', socket => {
                    let id = uuid.v1();
                    let info = { socket, handlers: new Map() };
                    this.sockets.set(id, info);

                    for (let event of this.socketEvents) {
                        let handler = this._getSocketEventHandler(event, id);
                        info.socket.on(event, handler);
                        info.handlers.set(event, handler);
                    }

                    socket.once('disconnect', () => {
                        this.sockets.delete(id);
                    });

                    this.emit(`socket_connection`, id, socket);
                });
            }

            return new Promise(resolve => {
                this.server.once('listening', () => {
                    this.listening = true;
                    resolve();
                });
            });
        }
    }

    /**
     * Stop the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async stop(name) {
        if (name !== this.name)
            throw new Error(`Server ${name} was not properly initialized`);

        if (this._config.get(`servers.${name}.enable`) === false)
            return;

        if (!this.server || !this.listening)
            return;

        this.sockets.clear();
        this.io = null;
        this.server.close();
        await new Promise(resolve => {
            this.server.once('close', () => {
                this.server = null;
                this.listening = false;

                let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
                this._logger.info(
                    this.name + ': Server is no longer listening on ' +
                    (typeof port === 'string'
                        ? port
                        : this._config.get(`servers.${this.name}.host`) + ':' + port)
                );
                resolve();
            });
        });

        let middlewareConfig = this._config.get(`servers.${name}.middleware`);
        if (!Array.isArray(middlewareConfig) || !this._app.has('express.middleware'))
            return;

        this._logger.debug('express', `${this.name}: Unloading middleware`);
        let middleware = this._app.get('express.middleware');
        return middlewareConfig.reduce(
            async (prev, cur) => {
                await prev;

                if (!middleware.has(cur))
                    return;

                let obj = middleware.get(cur);
                if (typeof obj.unregister !== 'function')
                    return;

                this._logger.debug('express', `${this.name}: Unregistering middleware ${cur}`);
                let result = obj.unregister(this);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Middleware '${cur}' unregister() did not return a Promise`);
                return result;
            },
            Promise.resolve()
        );
    }

    /**
     * Install event handler at the end of the list
     * @param {string} event            Event name
     * @param {function} handler        Event handler
     */
    on(event, handler) {
        super.on(event, handler);
        if (event.startsWith('socket_'))
            this._installSocketEvent(event);
    }

    /**
     * Install event handler at the beginning of the list
     * @param {string} event            Event name
     * @param {function} handler        Event handler
     */
    prependListener(event, handler) {
        super.prependListener(event, handler);
        if (event.startsWith('socket_'))
            this._installSocketEvent(event);
    }

    /**
     * Remove event handler
     * @param {string} event            Event name
     * @param {function} handler        Event handler
     */
    removeListener(event, handler) {
        super.removeListener(event, handler);
        if (event.startsWith('socket_') && !this.listenerCount(event))
            this._removeSocketEvent(event);
    }

    /**
     * Remove all event handlers
     * @param {string} event            Event name
     */
    removeAllListeners(event) {
        super.removeAllListeners(event);
        if (event.startsWith('socket_'))
            this._removeSocketEvent(event);
    }

    /**
     * Error handler
     * @param {object} error            The error
     * @return {Promise}
     */
    async onError(error) {
        if (error.syscall !== 'listen')
            return this._logger.error(new NError(error, 'Express.onError()'));

        let msg;
        switch (error.code) {
            case 'EACCES':
                msg = `${this.name}: Could not bind to web server port`;
                break;
            case 'EADDRINUSE':
                msg = `${this.name}: Web server port is already in use`;
                break;
            default:
                msg = error;
        }
        return this._app.exit(this._app.constructor.fatalExitCode, msg);
    }

    /**
     * Listening event handler
     * @return {Promise}
     */
    async onListening() {
        let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
        this._logger.info(
            this.name + ': ' +
            (this._config.get(`servers.${this.name}.ssl.enable`) ? 'HTTPS' : 'HTTP') +
            ' server listening on ' +
            (typeof port === 'string'
                ? port
                : this._config.get(`servers.${this.name}.host`) + ':' + port)
        );
    }

    /**
     * Normalize port parameter
     * @param {string|number} val           Port value
     * @return {*}
     */
    _normalizePort(val) {
        let port = parseInt(val, 10);
        if (isNaN(port))
            return val;
        if (port >= 0)
            return port;
        return false;
    }

    /**
     * Web socket event handler
     * @param {string} event                Event name
     * @param {string} id                   Socket ID
     */
    _getSocketEventHandler(event, id) {
        return (...args) => {
            args.unshift(id);
            this.emit(`socket_${event}`, ...args);
        };
    }

    /**
     * Install re-emitting event handlers for socket event
     * @param {string} event                Event name starting with "socket_"
     */
    _installSocketEvent(event) {
        let socketEvent = event.split('_').slice(1).join('_');
        this.socketEvents.add(socketEvent);
        for (let [id, info] of this.sockets) {
            if (info.socket.listenerCount(socketEvent))
                continue;

            let handler = this._getSocketEventHandler(socketEvent, id);
            info.socket.on(socketEvent, handler);
            info.handlers.set(socketEvent, handler);
        }
    }

    /**
     * Remove re-emitting event handlers for socket event
     * @param {string} event                Event name starting with "socket_"
     */
    _removeSocketEvent(event) {
        let socketEvent = event.split('_').slice(1).join('_');
        this.socketEvents.delete(socketEvent);
        for (let info of this.sockets.values()) {
            let handler = info.handlers.get(socketEvent);
            if (!handler)
                continue;

            info.socket.removeListener(socketEvent, handler);
            info.handlers.delete(socketEvent);
        }
    }
}

module.exports = Express;
