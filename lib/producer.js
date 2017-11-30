'use strict';

const _ = require('lodash');
const AbstractClient = require('./abstract_client');

/**
 * Beanstalk job producer class
 */
class Producer extends AbstractClient {
	constructor(config) {
		super(config);
	}

	/**
	 * Put job to queue
	 * @param {*} job 
	 * {
	 *   payload:String,  // default empty string
	 *   priority:Number, // default 0
	 *   delay:Number,    // default 0
	 *   ttr:Number       // default 300
	 * }
	 */
	async putJob(job) {
		this.log(`put job: ${JSON.stringify(job)}`);
		let payload = _.get(job, 'payload', '');
		// if payload is object, parse to JSON
		if (_.isObject(payload)) {
			payload = JSON.stringify(payload);
		}
		const priority = _.get(job, 'priority', 0);
		const delay = _.get(job, 'delay', 0);
		const ttr = _.get(job, 'ttr', 300);
		const job_id = await this.client.putAsync(priority, delay, ttr, payload);
		this.log(`finished put job, job_id=${job_id}`);
		return Number(job_id);
	}

	async _onConnect() {
		await super._onConnect();

		// use the tube
		await this.client.useAsync(this.tube);
		this.log(`used ${this.tube} tube`);
	}
}

module.exports = Producer;
