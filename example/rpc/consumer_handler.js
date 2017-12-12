'use strict';

const {Producer} = require('../../index');
const config = require('./config.json');

module.exports = async function (payload, job_info) {
	console.log('\tpayload:', payload, '\n\tjob info:', job_info);
	console.log('JOB is started');
	console.log('Reply TubeID ' + payload.replyTubeId);

	// do the JOB
	const calculationResult = payload.randomNumber1 + payload.randomNumber2;

	console.log('JOB is finished');
	console.log('I am putting reply to ReplyTube');

	const producer = new Producer({
		enable_logging: true,
		host: config.host,
		port: config.port,
		tube: payload.replyTubeId
	});

	producer.on('error', e => {
		console.log('[Reply Producer] error:', e);
	});

	// Stop event
	producer.on('close', () => {
		console.log('[Reply Producer] connection closed!');
	});

	await producer.start();

	await producer.putJob({
		payload: JSON.stringify({
			calculationResult: calculationResult,
			message: 'Reply Message for ' + payload.replyTubeId,
			result: 'success'
		}),
		priority: 0,
		delay: 0,
		ttr: 60
	});

	producer.stop();
	console.log('Reply is put');
	return 'success';
};
