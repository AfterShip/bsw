'use strict';

const Beanstalk = require('fivebeans').client;
const moment = require('moment');
const bb = require('bluebird');
const _ = require('lodash');
const events = require('events');

/**
 * Abstract beanstalk client class
 */
class AbstractClient extends events.EventEmitter {
	constructor(config) {
		super();

		this.client = null;
		this.connected = false;
		this.host = config.host ? config.host : '127.0.0.1';
		this.port = config.port ? config.port : 11300;
		this.tube = config.tube ? config.tube : 'default';
		this.enable_logging = config.enable_logging ? config.enable_logging : false;
	}

	async start() {
		const _this = this;
		try {
			if (!_this.connected) {
				return new Promise((resolve, reject) => {
					try {
						_this.log(`connecting to beanstalkd at ${_this.host}:${_this.port}`);

						_this.client = new Beanstalk(_this.host, _this.port);
						bb.promisifyAll(_this.client, {multiArgs: true});

						_this.client.on('connect', function () {
							_this._onConnect().then(resolve).catch((e) => {
								// if _onConnect throws error, emit error outside
								_this.emit('error', e);
							});
						});

						_this.client.on('error', function (e) {
							// if fivebeans emit an error, emit it outside
							_this.emit('error', e);
						});

						_this.client.on('close', function () {
							_this.emit('close');
						});

						_this.client.connect();
					} catch (e) {
						// if error happen inside promise, reject the promise
						reject(e);
					}
				});
			}
			_this.log('client already connected, skipped');
		} catch (e) {
			// if start function has error, emit it outside
			_this.log('start error:', e);
			_this.emit('error', e);
		}
		return null;
	}

	stop() {
		try {
			this.connected = false;
			if (this.client) {
				this.client.end();
				this.client = null;
			}
		} catch (e) {
			this.log('stop error:', e);
			// if stop function has error, emit it outside
			this.emit('error', e);
		}
	}

	log(...args) {
		// if logging is not enable just return
		if (!this.enable_logging) {
			return;
		}
		let res_str = `[${moment.utc().format('YYYY-MM-DD HH:mm:ss UTC')}]`;
		for (const arg of args) {
			let str = arg;
			if (_.isObject(str)) {
				str = JSON.stringify(str);
			}
			res_str = `${res_str} ${str}`;
		}
		const log_args = [];
		for (const line of res_str.match(/.{1,120}/g)) {
			log_args.push(`${line}\n\t`);
		}
		log_args[log_args.length - 1] = log_args[log_args.length - 1].trim();
		console.log.apply(null, log_args);
	}

	async _onConnect() {
		this.log(`connected to beanstalkd at ${this.host}:${this.port}`);
		// mark connected
		this.connected = true;
	}
}

module.exports = AbstractClient;
