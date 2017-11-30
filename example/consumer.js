'use strict';

const Consumer = require('../index').Consumer;
const config = require(`./config.json`);
const handler = require('./consumer_handler');

(async () => {
	const consumer = new Consumer({
		host: config.host,
		port: config.port,
		tube: config.tube,
		reserve_timeout: 1,
		handler: handler
	});

	// Error handling
	consumer.on('error', (e) => {
		consumer.log('error:', e);
	});

	// Stop event
	consumer.on('close', () => {
		consumer.log('connection closed!');
	});

	await consumer.start();

	// Consumer runs for 3s
	setTimeout(() => {
		consumer.stop();
	}, 3 * 1000);
})();



