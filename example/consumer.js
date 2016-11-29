'use strict';

const Worker = require('../index');
const fs = require('fs');
const co = require('co');
const config = JSON.parse(fs.readFileSync(`${__dirname}/config.json`));

co(function* () {
	try {
		let worker = new Worker({
			host: config.host,
			port: config.port,
			tube: config.tube,
			max: 3,
			handler: `${__dirname}/consumer_handler`
		});
		yield worker.start();
		console.log('Worker started');
	} catch (e) {
		console.error('Error', e.stack);
	}
});
