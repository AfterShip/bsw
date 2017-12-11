'use strict';

const {Consumer} = require('../../index');
const config = require('./config.json');
const handler = require('./consumer_handler');

(async () => {
	const consumer = new Consumer({
		enable_logging: true,
		host: config.host,
		port: config.port,
		tube: config.tube,
		reserve_timeout: 1,
		max_processing_jobs: 3,
		handler: handler,
		auto_reconnect: true,
		final: async function (action, delay, result_or_error) {
			console.log(`final() ==> action=${action}, delay=${delay}, result_or_error=${result_or_error}`);
		}
	});

	// Error handling
	consumer.on('error', e => {
		console.log('error:', e);
	});

	// Stop event
	consumer.on('close', () => {
		console.log('connection closed!');
	});

	await consumer.start();

	// stop the consumer gracefully within 3s
	// await consumer.stopGracefully(3000);
})().catch(e => {
	console.log(e);
});
