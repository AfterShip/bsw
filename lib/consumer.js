'use strict';

const _ = require('lodash');
const bb = require('bluebird');
const AbstractClient = require('./abstract_client');
const Beanstalk = require('fivebeans').client;
const isAsyncFunc = require('is-async-func');

// Job actions
const ALL_JOB_ACTIONS = ['success', 'bury', 'release'];

/**
 * Beanstalk job consumer class
 */
class Consumer extends AbstractClient {
	/**
	 * Consumer class
	 * @param {Object}   config configuration for Consumer
	 * @param {String}   config.host beanstalk server host name, default value '127.0.0.1'
	 * @param {Number}   config.port beanstalk server port, default value 11300
	 * @param {String}   config.tube tube name, default value 'default'
	 * @param {Boolean}  config.enable_logging enable logging to console, default value false
	 * @param {Number}   config.reserve_timeout timeout value(in seconds) of job reservation, default value 30
	 * @param {Number}   config.max_processing_jobs max number of simultaneous jobs reserved, default value 1
	 * @param {Boolean}  config.auto_reconnect if true, will reconnect to server when connection closed by server, default value false
	 * @param {Function} config.handler handler function for the reserved jobs, interface: async function(payload, job_info)
	 * @param {Function} config.final (optional) will be triggered when a job is proceessed, interface: async function(action, delay, result_or_error)
	 */
	constructor(config) {
		super(config);
		// set reserve timeout, default 30s
		this.reserve_timeout = config.reserve_timeout || 30;
		// number of processing jobs
		this.processing_jobs_counter = 0;
		// maximum number of processing jobs
		this.max_processing_jobs = config.max_processing_jobs ? config.max_processing_jobs : 1;
		// set auto_reconnect flag
		this.auto_reconnect = config.auto_reconnect ? config.auto_reconnect : true;
		// set handler which is an async function
		if (!config.handler || !isAsyncFunc(config.handler)) {
			throw new Error('config.handler must be specified as an async function!');
		}
		this.handler = config.handler;
		// set optional final which is an async function
		if (config.final && !isAsyncFunc(config.final)) {
			throw new Error('if config.final is specified, it must be an async function!');
		}
		this.final = config.final;
	}

	/**
	 * Stop the client gracefully, with timeout
	 * @param {Number} timeout stop timeout value in milliseconds
	 */
	async stopGracefully(timeout) {
		// timeout should be Integer
		if (Number.isInteger(timeout)) {
			// not continue to reserve jobs
			this.connected = false;

			// wait until all reserved jobs done, or waiting timeout
			const begin = new Date().getTime();
			let time_used = 0;
			while (this.processing_jobs_counter > 0 && time_used < timeout) {
				// wait for 1s
				await bb.delay(1000);
				// add time used
				time_used = new Date().getTime() - begin;
			}
		}
		super.stop();
	}

	async _onConnect() {
		await super._onConnect();

		// watch the tube
		await this.client.watchAsync(this.tube);
		this.log(`watched ${this.tube} tube`);

		// _work() async function runs asynchonously
		this._work().catch((e) => {
			// emit error in the main loop
			this.emit('error', e);
		});
	}

	async _onConnectionClose() {
		await super._onConnectionClose();

		// if enabled auto_reconnect, and connection is not closed by client
		// call _connect() to reconnect
		if (this.auto_reconnect && this.connected) {
			await this._connect();
		}
	}

	/**
	 * Main logic of the consumer,
	 * keep reserving jobs and processing them
	 */
	async _work() {
		// main loop
		while (this.connected) {
			// check if reserved jobs are too many
			if (this.processing_jobs_counter >= this.max_processing_jobs) {
				await bb.delay(50);
				continue;
			}

			let job;
			try {
				job = await this.client.reserve_with_timeoutAsync(this.reserve_timeout);
			} catch (reserve_error) {
				// reserve timeout
				continue;
			}
			// increate reserved counter
			this.processing_jobs_counter++;

			// asynchonously processing the job
			this._processJob(job).catch((e) => {
				// emit the error outside
				this.emit('error', e);
			});

			// idle 50 milliseconds
			await bb.delay(50);
		}
	}

	/**
	 * Process job logic
	 */
	async _processJob(job) {
		const [job_id, job_payload] = job;
		const job_info = {tube: this.tube, id: job_id};
		let payload = job_payload.toString('utf8');
		try {
			payload = JSON.parse(job_payload.toString('utf8'));
		} catch (parse_error) {
			// nothing here, payload is already a string
		}

		let action_with_delay = ['success', 0];
		let result_or_error;
		try {
			// handling the job
			result_or_error = await this.handler(payload, job_info);
			// success job action
			action_with_delay = this._actionFromResult(result_or_error);
		} catch (e) {
			this.log('error when handling the job:', e);
			result_or_error = e;
			// error job action
			action_with_delay = this._actionFromError(e);
		} finally {
			const [action, delay] = action_with_delay;
			// handle job action
			await this._handleJobAction(action, delay, job_id);
			// call final function if specified
			if (this.final) {
				try {
					await this.final(action, delay, result_or_error);
				} catch (e) {
					// if final function has error, emit it outside
					this.emit('error', e);
				}
			}
			// reduce reserved counter
			this.processing_jobs_counter--;
		}
	}

	/**
	 * handle the job action
	 * @param {*} action
	 * @param {*} delay
	 * @param {*} job_id
	 */
	async _handleJobAction(action, delay, job_id) {
		this.log(`handle job action, action=${action}, delay=${delay}, job_id=${job_id}`);
		try {
			if (action === 'bury') {
				await this.client.buryAsync(job_id, Beanstalk.LOWEST_PRIORITY);
			} else if (action === 'success') {
				await this.client.destroyAsync(job_id);
			} else if (action === 'release') {
				await this.client.releaseAsync(job_id, Beanstalk.LOWEST_PRIORITY, delay);
			} else {
				throw new Error(`unknown action ${action}`);
			}
		} catch (e) {
			this.log('error when handling the job action:', e);
		}
	}

	/**
	 * get action from handler function result
	 * @param {*} input either String of action, or Array of action and delay in pairs(for example 'success' or ['success', 30])
	 */
	_actionFromResult(input) {
		return this._actionFromInput(input, 'success');
	}

	/**
	 * get action from handler function error
	 * @param {*} input either String of action, or Array of action and delay in pairs(for example 'success' or ['success', 30])
	 */
	_actionFromError(input) {
		return this._actionFromInput(input, 'bury');
	}

	/**
	 * validate and calculate the final job action
	 * @param {*} input
	 * @param {*} default_action
	 */
	_actionFromInput(input, default_action) {
		this.log(`_actionFromInput called: input=${input}, default_action=${default_action}`);

		let action = input;
		let delay = null;

		// if input is array, then extract
		// the first element as action
		// and the second as delay
		if (Array.isArray(input) && input.length > 1) {
			[action, delay] = input;
			delay = _.toNumber(delay);
		}

		// action should be lower case
		if (_.isString(action)) {
			action = action.toLowerCase();
		}

		// if action not valid, then set to default value
		if (!_.isString(action) || !_.includes(ALL_JOB_ACTIONS, action)) {
			action = default_action;
		}

		// if action is 'release' and delay not specified, set default delay to 30
		if (action === 'release' && !delay) {
			delay = 30;
		}

		return [action, delay];
	}
}

module.exports = Consumer;
