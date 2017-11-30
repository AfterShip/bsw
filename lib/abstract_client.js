'use strict';

const Beanstalk = require('fivebeans').client;
const moment = require('moment');
const bb = require('bluebird');
const _ = require('lodash');

/**
 * Abstract beanstalk client class
 */
class AbstractClient {
	constructor(config) {
		this.client = null;
		this.connected = false;
		this.host = config.host?config.host : '127.0.0.1';
		this.port = config.port?config.port : 11300;
		this.tube = config.tube?config.tube : 'default';
	}

	async start() {
		const _this = this;
		if (!_this.connected) {
			return new Promise(resolve => {
				_this.log(`connecting to beanstalkd at ${_this.host}:${_this.port}`);
				
				_this.client = new Beanstalk(_this.host, _this.port);
				bb.promisifyAll(_this.client, {multiArgs: true});
	
				_this.client.on('connect', function () {
					_this._onConnect().then(resolve);
				});
		
				_this.client.on('error', function (e) {
					_this._onConnectionError(e).then();
				});
		
				_this.client.on('close', function () {
					_this._onConnectionClose().then();
				});
		
				_this.client.connect();
			});
		} else {
			_this.log(`client already connected, skipped`);
		}
	}

	stop() {
		this.connected = false;
		if (this.client) {
			this.client.end();
			this.client = null;
		}
	}

	log() {
		let res_str = `${moment.utc().format('YYYY-MM-DD HH:mm:ss UTC')}`;
		for (let arg of arguments) {
			let str = arg;
			if (_.isObject(str)) {
				str = JSON.stringify(str);
			}
			res_str = `${res_str} ${str}`;
		}
		let args = [];
		for (let line of res_str.match(/.{1,120}/g)) {
			args.push(`${line}\n\t`);
		}
		args[args.length - 1] = args[args.length - 1].trim();
		console.log.apply(null, args);
	}

	async _onConnect () {
		this.log(`connected to beanstalkd at ${this.host}:${this.port}`);
		// mark connected
		this.connected = true;
	}

	async _onConnectionError(err) {
		this.log('connection error:', err);
	}

	async _onConnectionClose () {
		this.log('connection closed');
	}
}

module.exports = AbstractClient;
