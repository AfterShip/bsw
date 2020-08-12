'use strict';

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const {expect} = require('chai');
const FivebeansMock = require('./lib/fivebeans_mock');
const AbstractClient = proxyquire('../lib/abstract_client', {
	'fivebeans': FivebeansMock
});

const config = {
	tube: 'sample',
	handler: async function () {
		return 'success';
	},
	host: 'localhost',
	port: 11300
};

describe('Consumer', () => {
	let consumer;

	beforeEach(async () => {
		const Consumer = proxyquire('../lib/consumer', {
			'./abstract_client': AbstractClient
		});

		consumer = new Consumer(config);
		// _work will start the main loop, need to stub it here
		consumer._work = sinon.stub().returns(Promise.resolve());
		await consumer.start();
	});

	describe('test stopGracefully()', () => {
		beforeEach(() => {
			sinon.stub(AbstractClient.prototype, 'stop');
		});

		it('should call super._stop() directly if timeout is undefined', async () => {
			await consumer.stopGracefully();

			expect(AbstractClient.prototype.stop).to.have.property('called', true);
		});
	});

	describe('test _onConnect()', () => {
		beforeEach(() => {
			AbstractClient.prototype._onConnect = sinon.stub().returns(Promise.resolve());
			consumer.client.watchAsync = sinon.stub().returns(Promise.resolve());
			consumer._work = sinon.stub().returns(Promise.resolve());
		});

		it('should call super._onConnect(), client.watchAsync() and _work()', async () => {
			await consumer._onConnect();

			expect(AbstractClient.prototype._onConnect).to.have.property('called', true);
			expect(consumer.client.watchAsync).to.have.property('called', true);
			expect(consumer._work).to.have.property('called', true);
		});

		it('should emit error if _work() throws', async () => {
			consumer._work = sinon.stub().returns(Promise.reject('error'));
			consumer.emit = sinon.stub();
			await consumer._onConnect();

			expect(consumer.emit).to.have.property('called', true);
			expect(consumer.emit.args[0][0]).to.equal('error');
		});
	});

	describe('test _onConnectionClose()', () => {
		beforeEach(() => {
			AbstractClient.prototype._onConnectionClose = sinon.stub().returns(Promise.resolve());
			consumer._connect = sinon.stub().returns(Promise.resolve());
		});

		it('should call super._onConnectionClose()', async () => {
			await consumer._onConnectionClose();

			expect(AbstractClient.prototype._onConnectionClose).to.have.property('called', true);
		});

		it('should call this._connect() if auto_reconnect is true and connected is true', async () => {
			consumer.connected = true;
			consumer.auto_reconnect = true;
			await consumer._onConnectionClose();

			expect(consumer._connect).to.have.property('called', true);
		});

		it('should not call this._connect() if auto_reconnect is false', async () => {
			consumer.connected = true;
			consumer.auto_reconnect = false;

			await consumer._onConnectionClose();
			expect(consumer._connect).to.have.property('called', false);
		});

		it('should not call this._connect() if connected is false', async () => {
			consumer.connected = false;
			consumer.auto_reconnect = true;

			await consumer._onConnectionClose();
			expect(consumer._connect).to.have.property('called', false);
		});
	});

	describe('test _processJob()', () => {
		beforeEach(() => {
			consumer.handler = sinon.stub().returns(Promise.resolve());
			consumer._actionFromResult = sinon.stub().returns(['success', 0]);
			consumer._actionFromError = sinon.stub().returns(['success', 0]);
			consumer._handleJobAction = sinon.stub().returns(['success', 0]);
		});

		it('should call this.handler() with correct string parameter', async () => {
			await consumer._processJob([1, 'string parameter']);

			expect(consumer.handler).to.have.property('called', true);
			expect(consumer.handler.args[0][0]).to.equal('string parameter');
		});

		it('should call this.handler() with correct JSON parameter', async () => {
			await consumer._processJob([1, '{"key": "value"}']);

			expect(consumer.handler).to.have.property('called', true);
			expect(consumer.handler.args[0][0]).to.deep.equal({key: 'value'});
		});

		it('should call this._actionFromResult() if handler is successfully called', async () => {
			await consumer._processJob([1, 'string parameter']);

			expect(consumer._actionFromResult).to.have.property('called', true);
		});

		it('should call this._actionFromError() if handler throws error', async () => {
			consumer.handler.throws(new Error('error'));
			await consumer._processJob([1, 'string parameter']);

			expect(consumer._actionFromError).to.have.property('called', true);
		});

		it('should call _handleJobAction() with final() for handler success case', async () => {
			await consumer._processJob([1, 'string parameter']);

			expect(consumer._handleJobAction).to.have.property('called', true);
		});

		it('should call _handleJobAction() with final() for handler error case', async () => {
			consumer.handler.throws(new Error('error'));
			await consumer._processJob([1, 'string parameter']);

			expect(consumer._handleJobAction).to.have.property('called', true);
		});
	});

	describe('test _handleJobAction()', () => {
		beforeEach(() => {
			consumer.client.buryAsync = sinon.stub().returns(Promise.resolve());
			consumer.client.destroyAsync = sinon.stub().returns(Promise.resolve());
			consumer.client.releaseAsync = sinon.stub().returns(Promise.resolve());
			consumer.log = sinon.stub();
		});

		it('should call client.buryAsync if action is "bury"', async () => {
			await consumer._handleJobAction('bury', 0, 1);

			expect(consumer.client.buryAsync).to.have.property('called', true);
			expect(consumer.client.buryAsync.args[0][0]).to.equal(1);
			expect(consumer.client.buryAsync.args[0][1]).to.equal(1000);
		});

		it('should call client.destroyAsync if action is "success"', async () => {
			await consumer._handleJobAction('success', 0, 1);

			expect(consumer.client.destroyAsync).to.have.property('called', true);
			expect(consumer.client.destroyAsync.args[0][0]).to.equal(1);
		});

		it('should call client.releaseAsync if action is "release"', async () => {
			await consumer._handleJobAction('release', 30, 1);

			expect(consumer.client.releaseAsync).to.have.property('called', true);
			expect(consumer.client.releaseAsync.args[0][0]).to.equal(1);
			expect(consumer.client.releaseAsync.args[0][1]).to.equal(1000);
			expect(consumer.client.releaseAsync.args[0][2]).to.equal(30);
		});

		it.skip('should log unknown action error if action is not valid', async () => {
			await consumer._handleJobAction('unknown', 0, 1);

			expect(consumer.log.args[1][0]).to.deep.equal('error when handling the job action:');
			expect(consumer.log.args[1][1]).to.deep.equal(new Error('unknown action unknown'));
		});
	});

	describe('test _actionFromInput', () => {
		it('should return correct action for string input', () => {
			const rtn = consumer._actionFromInput('bury', 'success');

			expect(rtn).to.deep.equal(['bury', null]);
		});

		it('should return correct action for array input', () => {
			const rtn = consumer._actionFromInput(['success', 100], 'success');

			expect(rtn).to.deep.equal(['success', 100]);
		});

		it('should convert to lower-case for string action', () => {
			const rtn = consumer._actionFromInput('BURY', 'success');

			expect(rtn).to.deep.equal(['bury', null]);
		});

		it('should convert to lower-case for array action', () => {
			const rtn = consumer._actionFromInput(['sUcCeSs', 0], 'bury');

			expect(rtn).to.deep.equal(['success', 0]);
		});

		it('should use default action for invalid action', () => {
			const rtn = consumer._actionFromInput(['sucks', 0], 'bury');

			expect(rtn).to.deep.equal(['bury', 0]);
		});

		it('should use default delay for "release" string action', () => {
			const rtn = consumer._actionFromInput('release', 'bury');

			expect(rtn).to.deep.equal(['release', 30]);
		});

		it('should use default delay for "release" array action', () => {
			const rtn = consumer._actionFromInput(['release', 0], 'bury');

			expect(rtn).to.deep.equal(['release', 30]);
		});

		it('should use specified delay for "release" array action', () => {
			const rtn = consumer._actionFromInput(['release', 100], 'bury');

			expect(rtn).to.deep.equal(['release', 100]);
		});
	});

	afterEach(() => {
		consumer.stop();
	});
});
