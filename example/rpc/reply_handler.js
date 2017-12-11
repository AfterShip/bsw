'use strict';

module.exports = async function (payload, job_info) {
	console.log('I got the reply from Reply Tube');
	console.log('\tpayload:', payload, '\n\tjob info:', job_info);
	return payload;
};
