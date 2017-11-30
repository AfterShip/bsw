'use strict';

require('co-mocha');

const _ = require('lodash');
const co = require('co');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = {
	tube: 'sample',
	handler: async function() {
		return 'success';
	},
	host: 'localhost',
	port: 11300
};

describe('Consumer', () => {

});