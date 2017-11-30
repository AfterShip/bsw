'use strict';

const _ = require('lodash');
const co = require('co');
const moment = require('moment');
const AbstractClient = require('./abstract_client');
const Beanstalk = require('fivebeans').client;
const isAsyncFunc = require('is-async-func');

// Job actions
const ALL_JOB_ACTIONS = ['success', 'bury', 'release'];

/**
 * Beanstalk job consumer class
 */
class Consumer extends AbstractClient {
	constructor(config) {
		super(config);
		// set reserve timeout, default 30s
		this.reserve_timeout = config.reserve_timeout || 30;
		// set handler which is a async function
		if (!config.handler || !isAsyncFunc(config.handler)) {
			throw new Error('config.handler must be specified as an async function!');
		}
		this.handler = config.handler;
	}

	async _onConnect() {
		await super._onConnect();
		
		// watch the tube
		await this.client.watchAsync(this.tube);
		this.log(`watched ${this.tube} tube`);

		// main loop runs asynchonously
		(async () => {
			while (this.connected) {
				let job;
				try {
					job = await this.client.reserve_with_timeoutAsync(this.reserve_timeout);
				} catch (reserve_error) {
					// reserve timeout
					continue;
				}
				const job_id = job[0];
				const job_info = {tube: this.tube, id: job_id};
				let payload = job[1].toString('utf8');
				try {
					const parsed_payload = JSON.parse(payload);
					if (_.isObject(parsed_payload)) payload = parsed_payload;
				} catch (parse_error) {
					// nothing here, payload is already a string
				}
	
				let action_with_delay = ['success', 0];
				try {
					// handling the job
					const result = await this.handler(payload, job_info);
					// success job action
					action_with_delay = this._actionFromResult(result);
				} catch (e) {
					this.log('error when handling the job:', e);
					// error job action
					action_with_delay = this._actionFromError(e);
				} finally {
					// handle job action
					await this._handleJobAction(action_with_delay[0], action_with_delay[1], job_id);
				}
	
				// idle 50 milliseconds
				await this._idle();
			}
		})();
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
	 * idle the process for some time
	 * @param {*} time_millis 
	 */
	async _idle(time_millis) {
		return new Promise(resolve => setTimeout(resolve, time_millis || 50));
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
		let action = input;
		let delay = null;

		// if input is array, then extract 
		// the first element as action 
		// and the second as delay
		if (_.isArray(input) && input.length > 1) {
			action = input[0];
			delay = _.toNumber(input[1]);
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
