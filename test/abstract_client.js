'use strict';

require('co-mocha');

const _ = require('lodash');
const co = require('co');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const expect = require('chai').expect;
const timemachine = require('timemachine');

const config = {
	tube: 'sample',
	handler: async function() {
		return 'success';
	},
	host: 'localhost',
	port: 11300
};

describe('AbstractClient', () => {
	let abstract_client;
	let callbacks;

	beforeEach(() => {
		const events_map = {
			connect: null,
			error: null,
			close: null
		};

		callbacks = {
			_onConnect: sinon.stub().returns(Promise.resolve()),
			errorCallback: sinon.stub(),
			closeCallback: sinon.stub()
		};

		const AbstractClient = proxyquire('../lib/abstract_client', {
			'fivebeans': {
				client: function() {
					return {
						on: function (ev, cb) {
							for (let event of Object.keys(events_map)) {
								if (event === ev) {
									events_map[event] = cb;
								}
							}
							return this;
						},
						connect: function () {
							// trigger event 'connect'
							events_map.connect();
						},
						end: function () {
							// trigger event 'close'
							events_map.close();
						},
						error: function () {
							// trigger event 'error'
							events_map.error(new Error('error case'));
						}
					};
				}
			}
		});
		abstract_client = new AbstractClient(config);
		abstract_client.on('error', callbacks.errorCallback);
		abstract_client.on('close', callbacks.closeCallback);
	});

	describe('testing function start()', () => {
		it('should set connected to true', async () => {
			await abstract_client.start();

			expect(abstract_client.connected).to.equal(true);
		});

		it('should have called _onConnect() when connection established', async () => {
			abstract_client._onConnect = callbacks._onConnect;
			await abstract_client.start();
			
			expect(callbacks._onConnect).to.have.property('called', true);
		});

		it('should have handled error event when start() threw error', async () => {
			abstract_client._onConnect = async function () {
				// mock trigger five beans error event
				abstract_client.client.error();
			};
			await abstract_client.start();

			expect(callbacks.errorCallback).to.have.property('called', true);
			expect(callbacks.errorCallback.args[0][0]).to.deep.equal(new Error('error case'));
		});
	});

	describe('testing function stop()', () => {
		beforeEach(() => {
			abstract_client._onConnect = callbacks._onConnect;
		});

		it('should set connected to false, and client to null', async () => {
			await abstract_client.start();
			abstract_client.stop();

			expect(abstract_client.connected).to.equal(false);
			expect(abstract_client.client).to.equal(null);
		});

		it('should have called _onConnectionClose() when connection closed', async () => {
			await abstract_client.start();
			abstract_client.stop();

			expect(callbacks.closeCallback).to.have.property('called', true);
		});

		it('should have called errorCallback when stop function throws error', async () => {
			await abstract_client.start();

			// mock fivebeans end error
			abstract_client.client.end = () => {
				throw new Error('close error');
			};
			
			abstract_client.stop();

			expect(callbacks.errorCallback).to.have.property('called', true);
			expect(callbacks.errorCallback.args[0][0]).to.deep.equal(new Error('close error'));
		});
	});

	describe('testing function log()', () => {
		let stub_console_log = sinon.stub();
		const real_console_log = console.log;

		beforeEach(() => {
			timemachine.config({
				dateString: '2017-11-30 15:17:30 UTC'
			});
			console.log = stub_console_log;
			abstract_client.enable_logging = true;
		});

		it('should not log anything when logging is not enabled', () => {
			// disable logging
			abstract_client.enable_logging = false;
			abstract_client.log('test log 1');

			expect(stub_console_log).to.have.property('called', false);
		});

		it('should print out correct log with single string', () => {
			abstract_client.log('test log 1');

			expect(stub_console_log).to.have.property('called', true);
			expect(stub_console_log.args[0][0]).to.equal('[2017-11-30 15:17:30 UTC] test log 1');
		});

		it('should print out correct log with single object', () => {
			abstract_client.log({key: 'test value 1'});

			expect(stub_console_log).to.have.property('called', true);
			expect(stub_console_log.args[0][0]).to.equal('[2017-11-30 15:17:30 UTC] {"key":"test value 1"}');
		});

		it('should print out correct log with multiple objects and strings', () => {
			abstract_client.log({key: 'test obj 1'}, 'test string 2', {key: 'test obj 3'});

			expect(stub_console_log).to.have.property('called', true);
			expect(stub_console_log.args[0][0]).to.equal('[2017-11-30 15:17:30 UTC] {"key":"test obj 1"} test string 2 {"key":"test obj 3"}');
		});

		afterEach(() => {
			console.log = real_console_log;
			stub_console_log = sinon.stub();
			timemachine.reset();
		});
	});

});
