'use strict';

module.exports = async function (payload, job_info) {
	console.log('\tpayload:', payload, '\n\tjob info:', job_info);

	// payload maybe a string
	if (typeof payload !== 'object') {
		return payload;
	}

	// or payload maybe an object
	if (payload.throw) {
		// throw action('success' or ['release', 15])
		throw payload.result;
	}

	// returns action('success' or ['release', 15])
	return payload.result;
};
