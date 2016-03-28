'use strict';

class WorkerHandler {
	* run(payload, job_info) {
		// Handler function MUST return a Promise or be a Generator function
		console.log('\tpayload:', payload, '\n\tjob info:', job_info);
		
		// payload maybe a string
		if (typeof payload !== 'object') {
			return payload;
		}

		// or payload maybe an object
		if (payload.throw) {
			throw payload.result;
		}

		return payload.result
	}

	final(action, delay, result) {
		console.log('\taction:', action, '\n\tdelay:', delay, '\n\tresult:', result);
	}
}

module.exports = WorkerHandler;
