'use strict';

require('co-mocha');

const _ = require('lodash');
const co = require('co');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const chai = require('chai');
chai.use(sinonChai);

const WorkerConnection = require('../index');

function genConfig(co_body) {
	class Sample {
		run(payload, job_info) {
			return co(co_body);
		}

		final() {
			console.log(JSON.stringify(arguments, null, 4));
		}
	}

	return {
		tube: 'sample',
		handler: Sample,
		host: 'localhost',
		port: 11300,
		max: 1
	};
}

describe('Testing WorkerConnection._onConnect', function () {
	it('should call handler with expected input', function* (done) {
		let client = {};
		client.watchAsync = function () {return co(function* () {});};
		client.reserve_with_timeoutAsync = function () {};
		let reserve_called_counter = 0;
		let reserve_stub = sinon.stub(client, 'reserve_with_timeoutAsync', function () {
			reserve_called_counter = reserve_called_counter + 1;

			if (reserve_called_counter === 1) {
				return co(function* () {return [1, '{"key":"value"}'];});
			}

			if (reserve_called_counter === 2) {
				return co(function* () {throw Error('unknown error');});
			}

			if (reserve_called_counter === 3) {
				return co(function* () {return [2, 'string payload'];});
			}

			if (reserve_called_counter === 4) {
				return co(function* () {return [2, 'string payload'];});
			}

			worker.connected = false; // do not continue after 4 reserves
		});

		let worker = new WorkerConnection(genConfig(function* () {}));
		let handler_called_counter = 0;
		let handler_stub = sinon.stub(worker, 'handler', function () {
			co(function* () {
				try {
					handler_called_counter = handler_called_counter + 1;

					if (handler_called_counter === 2) {
						chai.expect(reserve_stub).to.have.been.calledTrice;
						chai.expect(handler_stub).to.have.been.calledTwice;
						chai.expect(handler_stub).to.have.been.calledWith({key: 'value'}, {id: 1, tube: 'sample'});
						chai.expect(handler_stub).to.have.been.calledWith('string payload', {id: 2, tube: 'sample'});
						done();
					}
				} catch (e) {
					console.log('check failed:', JSON.stringify(e));
					worker.connected = false;
				}
				worker.reserved_counter = worker.reserved_counter - 1;
			});
		});

		worker.client = client;
		yield worker._onConnect();
	});
});

describe('Testing WorkerConnection._wrapHandler', function () {
	it('should give wrapped function', function () {
		let worker = new WorkerConnection(genConfig(function* () {}));
		chai.expect(worker.handler).to.be.function;
	});

	it('wrapped function got payload and job_info', function (done) {
		class Sample {
			run(payload, job_info) {
				this.payload = payload;
				this.job_info = job_info;
				return co(function* () {
					chai.expect(payload).to.equal('payload');
					chai.expect(job_info.id).to.equal(1);
					chai.expect(job_info.tube).to.equal('sample');
					done();
				});
			}
		}
		let config = {
			tube: 'sample',
			handler: Sample,
			host: 'localhost',
			port: 11300,
			max: 5
		};

		let worker = new WorkerConnection(config);
		worker.handler('payload', {id: 1, tube: 'sample'});
	});

	function testRunToAction(expected_action, run_description, co_run, final_callback) {
		it(`wrapped function (${expected_action}) translated to \'${run_description}\' action`, function (done) {
			let client = {};
			client.buryAsync = function () {};
			client.destroyAsync = function () {};
			client.releaseAsync = function () {};

			let bury_stub = sinon.stub(client, 'buryAsync');
			bury_stub.onCall(0).returns(co(function* () {}));

			let destroy_stub = sinon.stub(client, 'destroyAsync');
			destroy_stub.onCall(0).returns(co(function* () {}));

			let release_stub = sinon.stub(client, 'releaseAsync');
			release_stub.onCall(0).returns(co(function* () {}));

			class Sample {
				run(payload, job_info) {
					return co(co_run);
				}

				final(action, delay, result_or_error) {
					try {
						final_callback(action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done);
					} catch (e) {
						console.log('final() failed:', JSON.stringify(e));
					}
				}
			}
			let config = {
				tube: 'sample',
				handler: Sample,
				host: 'localhost',
				port: 11300,
				max: 5
			};

			let worker = new WorkerConnection(config);
			worker.client = client;
			worker.handler('payload', {id: 1, tube: 'sample'});
		});
	}

	function checkSuccess(action, destroy_stub) {
		chai.expect(action).to.equal('success');
		chai.expect(destroy_stub).to.have.been.calledOnce;
		chai.expect(destroy_stub).to.have.been.calledWith(1);
	}

	function checkBury(action, bury_stub) {
		chai.expect(action).to.equal('bury');
		chai.expect(bury_stub).to.have.been.calledOnce;
		chai.expect(bury_stub).to.have.been.calledWith(1, 1000);
	}

	function checkRelelase(action, release_stub, delay) {
		chai.expect(action).to.equal('release');
		chai.expect(release_stub).to.have.been.calledOnce;
		chai.expect(release_stub).to.have.been.calledWith(1, 1000, delay);
	}

	testRunToAction(
		'no return',
		'success',
		function* () {},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkSuccess(action, destroy_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(result_or_error).to.equal(undefined);
			done();
		}
	);

	testRunToAction(
		'returns string',
		'success',
		function* () {return 'string';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkSuccess(action, destroy_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(result_or_error).to.equal('string');
			done();
		}
	);

	testRunToAction(
		'returns object',
		'success',
		function* () {return {key: 'value'};},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkSuccess(action, destroy_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(JSON.stringify(result_or_error)).to.equal('{"key":"value"}');
			done();
		}
	);

	testRunToAction(
		'throw \'success\'',
		'success',
		function* () {throw 'success';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkSuccess(action, destroy_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(result_or_error).to.equal('success');
			done();
		}
	);

	testRunToAction(
		'return \'bury\'',
		'bury',
		function* () {return 'bury';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkBury(action, bury_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(result_or_error).to.equal('bury');
			done();
		}
	);

	testRunToAction(
		'throw string',
		'bury',
		function* () {throw 'string';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkBury(action, bury_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(result_or_error).to.equal('string');
			done();
		}
	);

	testRunToAction(
		'throw object',
		'bury',
		function* () {throw {key: 'value'};},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkBury(action, bury_stub);
			chai.expect(delay).to.equal(null);
			chai.expect(JSON.stringify(result_or_error)).to.equal('{"key":"value"}');
			done();
		}
	);

	testRunToAction(
		'return \'release\'; no delay set',
		'release',
		function* () {return 'release';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkRelelase(action, release_stub, 30);  // 30s default delay
			chai.expect(delay).to.equal(30);
			chai.expect(result_or_error).to.equal('release');
			done();
		}
	);

	testRunToAction(
		'throw \'release\'; no delay set',
		'release',
		function* () {throw 'release';},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkRelelase(action, release_stub, 30);  // 30s default delay
			chai.expect(delay).to.equal(30);
			chai.expect(result_or_error).to.equal('release');
			done();
		}
	);

	testRunToAction(
		'return \'release\'; 60s delay',
		'release',
		function* () {return ['release', 60];},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkRelelase(action, release_stub, 60);
			chai.expect(delay).to.equal(60);
			chai.expect(JSON.stringify(result_or_error)).to.equal('["release",60]');
			done();
		}
	);

	testRunToAction(
		'throw \'release\'; 60s delay',
		'release',
		function* () {throw ['release', 60];},
		function (action, delay, result_or_error, bury_stub, destroy_stub, release_stub, done) {
			checkRelelase(action, release_stub, 60);
			chai.expect(delay).to.equal(60);
			chai.expect(JSON.stringify(result_or_error)).to.equal('["release",60]');
			done();
		}
	);
});