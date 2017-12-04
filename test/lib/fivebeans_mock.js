'use strict';

const events = require('events');

class FivebeansMock extends events.EventEmitter {
	connect() {
		this.emit('connect');
	}

	end() {
		this.emit('close');
	}

	error(e) {
		this.emit('error', e);
	}

	putAsync() {
		return Promise.resolve(this);
	}

	useAsync() {
		return Promise.resolve(this);
	}

	watchAsync() {
		return Promise.resolve(this);
	}
}

FivebeansMock.LOWEST_PRIORITY = 1000;

module.exports = {
	client: FivebeansMock
};
