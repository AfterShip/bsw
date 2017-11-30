'use strict';

const Producer = require('../index').Producer;
const config = require(`./config.json`);

(async () => {
	const producer = new Producer({
		host: config.host,
		port: config.port,
		tube: config.tube
	});

	// Error handling
	producer.on('error', (e) => {
		producer.log('error:', e);
	});
	
	// Stop event
	producer.on('close', () => {
		producer.log('connection closed!');
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
})();
