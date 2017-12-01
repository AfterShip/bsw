'use strict';

const {Producer} = require('../index');
const config = require('./config.json');

(async () => {
	const producer = new Producer({
		enable_logging: true,
		host: config.host,
		port: config.port,
		tube: config.tube
	});

	// Error handling
	producer.on('error', (e) => {
		console.log('error:', e);
	});

	// Stop event
	producer.on('close', () => {
		console.log('connection closed!');
	});

	await producer.start();

	await producer.putJob({
		payload: JSON.stringify({throw: true, result: 'success'}),
		priority: 0,
		delay: 0,
		ttr: 60
	});
	await producer.putJob({
		payload: JSON.stringify({throw: true, result: 'bury'}),
		priority: 0,
		delay: 0,
		ttr: 60
	});
	await producer.putJob({
		payload: JSON.stringify({throw: true, result: ['release', 15]}),
		priority: 0,
		delay: 0,
		ttr: 60
	});
	await producer.putJob({
		payload: JSON.stringify({throw: false, result: 'success'}),
		priority: 0,
		delay: 0,
		ttr: 60
	});
	await producer.putJob({
		payload: JSON.stringify({throw: false, result: 'bury'}),
		priority: 0,
		delay: 0,
		ttr: 60
	});
	await producer.putJob({
		payload: JSON.stringify({throw: false, result: ['release', 15]}),
		priority: 0,
		delay: 0,
		ttr: 60
	});

	producer.stop();
})().catch((e) => {
	console.log(e);
});
