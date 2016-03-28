'use strict';

const Client = require('fivebeans').client;
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(`${__dirname}/config.json`));

let client = new Client(config.host, config.port);
client.on('connect', function() {
	console.log('connected');
	client.use(config.tube, function(err, tname) {
		console.log('used');
		client.put(0, 0, 60, JSON.stringify({throw: true, result: 'success'}), () => {});
		client.put(0, 0, 60, JSON.stringify({throw: true, result: 'bury'}), () => {});
		client.put(0, 0, 60, JSON.stringify({throw: true, result: ['release', 15]}), () => {});
		client.put(0, 0, 60, JSON.stringify({throw: false, result: 'success'}), () => {});
		client.put(0, 0, 60, JSON.stringify({throw: false, result: 'bury'}), () => {});
		client.put(0, 0, 60, JSON.stringify({throw: false, result: ['release', 15]}), () => {});
	});
});

client.connect();
