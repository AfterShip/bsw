'use strict';

module.exports = async function (payload, job_info) {
	console.log('\tpayload:', payload, '\n\tjob info:', job_info);
	
	// payload maybe a string
	if (typeof payload !== 'object') {
		return payload;
	}

	// or payload maybe an object
	if (payload.throw) {
		throw payload.result;
	}

	return payload.result;
};
