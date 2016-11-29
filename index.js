'use strict';

const _ = require('lodash');
const co = require('co');
const bb = require('bluebird');
const tmfy = require('tmfy');
const moment = require('moment');
const Beanstalk = require('fivebeans').client;

const events = require('events');

class WorkerConnection extends events.EventEmitter {
	constructor(config) {
		super();

		this.client = null;
		this.reserved_counter = 0;
		this.parse = config.parse !== undefined ? config.parse : true;
		this.logging = config.log !== undefined ? config.log : true;
		this.host = config.host !== undefined ? config.host : '127.0.0.1';
		this.port = config.port !== undefined ? config.port : 11300;
		this.tube = config.tube !== undefined ? config.tube : 'default';
		this.reserve_timeout = config.timeout !== undefined ? config.timeout : 1;
		this.client_timeout = config.client_timeout !== undefined ? config.client_timeout : 250;
		this.reconnect_delay = config.reconnect_delay !== undefined ? config.reconnect_delay : 500;
		this.reserved_limit = config.max !== undefined ? config.max : 1;

		this.handler = this._wrapHandler(this.tube, config.handler);
	}

	logArgs() {
		let _this = this;

		let res_str = `${moment.utc().format('YYYY-MM-DD HH:mm:ss UTC')} ${_this.tube}`;
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

		return args;
	}

	log() {
		// console.log.apply(null, arguments);
		// return;

		if (!this.logging) return;
		let args = this.logArgs.apply(this, arguments);
		console.log.apply(null, args);
	}

	err() {
		// console.error.apply(null, arguments);
		// return;

		if (!this.logging) return;
		let args = this.logArgs.apply(this, arguments);
		console.error.apply(null, args);
	}

	_wrapHandler(tube, handler) {
		let _this = this;
		let handler_obj = handler;

		if (_.isString(handler)) {
			handler_obj = require(handler);
		}

		return function (payload, job_info) {
			co(function* () {
				let action = null;
				let result_or_error = null;
				let obj = new handler_obj(job_info);
				let start_time = moment.utc();
				_this.log(`${job_info.id}:`, 'reserved', `(${JSON.stringify(payload)})`);
				try {
					result_or_error = yield obj.run(payload, job_info);
					action = _this._actionFromResult(result_or_error);
				} catch (error) {
					result_or_error = error;
					action = _this._actionFromError(error);
				} finally {
					_this._handleJob.apply(_this, action.concat(job_info));
					let end_time = moment.utc();
					let delta_time_sec = end_time.diff(start_time, 'seconds');
					_this.log(`${job_info.id}:`, 'finised,', action, `${delta_time_sec}s`, `(${JSON.stringify(payload)})`);
					try {
						if (_.isFunction(obj.final)) {
							action.push(result_or_error);
							obj.final.apply(obj, action);  // .concat(result_or_error));
						}
					} catch (e) {
						_this.emit('error', e);
					}
					_this.reserved_counter = _this.reserved_counter - 1;
				}
			});
		};
	}

	_actionFromResult(input) {
		return this._actionFromInput(input, 'success', ['bury', 'release']);
	}

	_actionFromError(input) {
		return this._actionFromInput(input, 'bury', ['success', 'release']);
	}

	_actionFromInput(input, default_action, other_actions) {
		let action = input;
		if (_.isArray(input) && input.length) {
			action = input[0];
		}

		if (_.isString(action)) {
			action = action.toLowerCase();
		}

		if (!_.isString(action) || !_.includes(other_actions, action)) {
			action = default_action;
		}

		let delay = null;
		if (action === 'release') {
			delay = 30;
			if (_.isArray(input) && input.length > 1) {
				delay = _.toNumber(input[1]);
			}
		}

		return [action, delay];
	}

	_handleJob(action, delay, job_info) {
		const _this = this;
		return co(function* () {
			try {
				let job_id = job_info.id;
				if (action === 'bury') {
					yield _this.client.buryAsync(job_id, Beanstalk.LOWEST_PRIORITY);
				} else if (action === 'success') {
					yield _this.client.destroyAsync(job_id);
				} else if (action === 'release') {
					yield _this.client.releaseAsync(job_id, Beanstalk.LOWEST_PRIORITY, delay);
				} else {
					throw new Error(`unknown action ${action}`);
				}
			} catch (err) {
				_this.emit('error', err);
			}
		});
	}

	start() {
		let _this = this;
		return co(function* () {
			_this.stopped = false;
			if (!_this.connected) {
				_this.log(`connecting to beanstalkd at ${this.host}:${this.port}`);
				yield _this._start();
				return;
			} else {
				_this.log(`client already connected, skipped`);
			}
		});
	}

	stop() {
		let _this = this;
		_this.stopped = true;
		if (_this.client) {
			_this.client.emit('error', 'stopped');
		}
	}

	_start() {
		let _this = this;
		return new Promise(resolve => {
			let reconnectCount = 0;
			let is_connected = false;

			const onConnect = co.wrap(function* () {
				is_connected = true;
				_this.log(`connected to beanstalkd at ${_this.host}:${_this.port}`);

				try {
					yield _this.client.watchAsyncTimeout(_this.client_timeout, _this.tube);
				} catch (e) {
					if (e.toString() !== 'Error: TIMEOUT') {
						_this.client.emit('error', e);
					}
					return;
				}

				_this.log(`subscribed to ${_this.tube} tube`);
				const clientTimeout = _this.reserve_timeout * 1000 + _this.client_timeout;
				resolve();

				while (_this.client && is_connected) {
					if (_this.reserved_counter >= _this.reserved_limit) {
						// out of quota
						yield _this._idle();
						continue;
					}

					let res;
					try {
						res = yield _this.client.reserve_with_timeoutAsyncTimeout(
							clientTimeout,
							_this.reserve_timeout
						);
					} catch (e) {
						if (e.toString() === 'Error: TIMEOUT') {
							return;
						}
						continue;
					}

					let payload = res[1].toString('utf8');

					if (_this.parse) {
						try {
							let parsed_payload = JSON.parse(payload);
							if (_.isObject(parsed_payload)) payload = parsed_payload;
						} catch (parse_error) {
							// nothing here, payload is already a string
						}
					}

					_this.reserved_counter = _this.reserved_counter + 1;

					try {
						let id = res[0];  // Job Id
						let tube = _this.tube;
						_this.handler(payload, {tube, id});
					} catch (e) {
						_this.emit('error', e);
					}
				}
			});

			const onError = co.wrap(function* (err) {
				_this.err(err);
				if (_this.client && is_connected) {
					is_connected = false;
					_this.client.destroyConnection();
				}
			});

			const onClose = co.wrap(function* () {
				is_connected = false;
				if (_this.stopped) {
					return;
				}

				_this.log(`connecting to ${_this.host}:${_this.port}`);

				_this.client = new Beanstalk(_this.host, _this.port);
				bb.promisifyAll(_this.client, {multiArgs: true});
				tmfy.timeifyAll(_this.client);
				_this.client.destroyConnection = function () {
					if (this.stream) {
						this.stream.destroy();
					}
				};
				_this.client.on('connect', onConnect);
				_this.client.on('error', onError);
				_this.client.on('close', onClose);

				if (reconnectCount > 0) {
					yield _this._idle(_this.reconnect_delay);
				}
				reconnectCount++;

				_this.client.connect();
				yield _this._idle(_this.client_timeout * 2);
				if (_this.client && !is_connected) {
					is_connected = true;
					_this.client.emit('error', 'timeout on connect');
				}
			});

			onClose();
		});
	}

	_idle(timeout) {
		return new Promise(r => setTimeout(r, timeout || 50));
	}
}

module.exports = WorkerConnection;
