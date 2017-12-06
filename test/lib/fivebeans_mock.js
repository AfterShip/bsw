'use strict';

const events = require('events');

class FivebeansMock extends events.EventEmitter {
	connect() {
		this.emit('connect');
	}

	end() {
		this.emit('close');
	}

	async putAsync() {
		return this;
	}

	async useAsync() {
		return this;
	}

	async watchAsync() {
		return this;
	}

	async reserve_with_timeoutAsync() {
		this.log('reserve_with_timeoutAsync() is called');
		return {
			job_id: 1,
			payload: 'string payload'
		};
	}

	async buryAsync() {
		return this;
	}

	async destroyAsync() {
		return this;
	}

	async releaseAsync() {
		return this;
	}

	error(e) {
		this.emit('error', e);
	}
}

FivebeansMock.LOWEST_PRIORITY = 1000;

module.exports = {
	client: FivebeansMock
};
