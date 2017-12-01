'use strict';

require('co-mocha');

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const {expect} = require('chai');

const config = {
	tube: 'sample',
	handler: async function () {
		return 'success';
	},
	host: 'localhost',
	port: 11300
};

describe('Producer', () => {
	let producer;
	let stubs;

	beforeEach(() => {
		const events_map = {
			connect: null,
			error: null,
			close: null
		};

		stubs = {
			useAsync: sinon.stub().returns(Promise.resolve()),
			putAsync: sinon.stub().returns(Promise.resolve('100'))
		};

		const Producer = proxyquire('../lib/producer', {
			'./abstract_client': proxyquire('../lib/abstract_client', {
				'fivebeans': {
					client: function () {
						return {
							on: function (ev, cb) {
								for (const event of Object.keys(events_map)) {
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
							useAsync: stubs.useAsync,
							putAsync: stubs.putAsync
						};
					}
				}
			})
		});

		producer = new Producer(config);
		producer.start();
	});

	describe('testing function putJob()', () => {
		it('should call putAsync() with correct parameters with string payload', async () => {
			await producer.putJob({
				payload: 'string payload',
				priority: 100,
				delay: 500,
				ttr: 50
			});

			expect(stubs.putAsync).to.have.property('called', true);
			expect(stubs.putAsync.args[0][0]).to.equal(100);
			expect(stubs.putAsync.args[0][1]).to.equal(500);
			expect(stubs.putAsync.args[0][2]).to.equal(50);
			expect(stubs.putAsync.args[0][3]).to.equal('string payload');
		});

		it('should call putAsync() with correct parameters with object payload', async () => {
			await producer.putJob({
				payload: {
					key: 'object payload'
				},
				priority: 100,
				delay: 500,
				ttr: 50
			});

			expect(stubs.putAsync).to.have.property('called', true);
			expect(stubs.putAsync.args[0][0]).to.equal(100);
			expect(stubs.putAsync.args[0][1]).to.equal(500);
			expect(stubs.putAsync.args[0][2]).to.equal(50);
			expect(stubs.putAsync.args[0][3]).to.deep.equal('{"key":"object payload"}');
		});

		it('should call putAsync() with default ttr 300', async () => {
			await producer.putJob({
				payload: 'string payload',
				priority: 100,
				delay: 500
			});

			expect(stubs.putAsync.args[0][2]).to.equal(300);
		});

		it('should returns correct job_id', async () => {
			const job_id = await producer.putJob({
				payload: 'string payload',
				priority: 100,
				delay: 500,
				ttr: 50
			});

			expect(job_id).to.equal(100);
		});
	});
});
