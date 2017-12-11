BSW is a Node.js framework for beanstalkd workers

[![Build Status](https://travis-ci.org/AfterShip/bsw.svg?branch=master)](https://travis-ci.org/AfterShip/bsw)

### v2.0.0 is the latest version. If you're looking for the README of v1, click this link: https://github.com/AfterShip/bsw/blob/master/README-v1.md

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Handler Function](#handler-function)
  - [Jobs processing](#jobs-processing)
  - [Post processing](#post-processing)
- [BSW Consumer class](#bsw-consumer-class)
  - [`async start()` function](#async-start-function)
  - [`stop()` function](#stop-function)
  - [`async stopGracefully(timeout)` function](#async-stopgracefullytimeout-function)
- [BSW Producer class](#bsw-producer-class)
- [Full example](#full-example)
- [Contributors](#contributors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Requirements

Node.js v8.0.0 or above is required.

## Quick Start

**Consumer**
```javascript
const {Consumer} = require('bsw');

(async () => {
	const consumer = new Consumer({
		host: '127.0.0.1',
		port: 27017,
		tube: 'example',
		handler: async function (payload, job_info) {
			console.log('processing job: ', payload);
			return 'success';
		}
	});

	// handling errors
	consumer.on('error', (e) => {
		console.log('error:', e);
	});

	await consumer.start();
})();
```

**Producer**
```javascript
const {Producer} = require('bsw');

(async () => {
	const producer = new Producer({
		host: '127.0.0.1',
		port: 27017,
		tube: 'example'
	});

	// handling errors
	producer.on('error', (e) => {
		console.log('error:', e);
	});

	await producer.start();

	await producer.putJob({
		payload: JSON.stringify({throw: true, result: 'success'}),
		priority: 0,
		delay: 0,
		ttr: 60
	});

	producer.stop();
})();
```

## Handler Function

In v2, handler must be an async function(https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)

`handler` interface:

**async handler(payload, job_info)**
- **payload:** beanstalk job payload string or object (if job is a valid JSON)
- **job_info:** job details
- **job_info.id:** job id
- **job_info.tube:** job tube

`handler` definition examples:
```javascript
async handler(payload, job_info) {
	console.log('Hello world!');
}
```

### Jobs processing

After job reservation, `handler` would be called. Each job must get one of the following status after processing:
- **success:** job processed succesfully and must be deleted from beanstalkd
- **bury:** job processing failed, it must be marked as buried in beanstalkd
- **release + delay:** job must be reserved again after delay

To report the job status, it must be returned or thrown from handler function:
```javascript
// delete job
return 'success';
throw 'success';

// bury job
return 'bury';
throw 'bury';

// reput job without delay
return 'release';
throw 'release';

// reput job with 10s delay
return ['release', 10];
throw ['release', 10];
```

Default statuses:
- **success** if `handler` returned with unknown keyword
- **bury** if `handler` thrown with unknown keyword

For example:
```javascript
async handler(payload, job_info) {
	try {
		await mayThrow();
	} catch (e) {
		return 'bury'
	}
	return 'success';
}
```
equals to
```javascript
async handler(payload, job_info) {
	await mayThrow();
}
```

### Post processing
You may add an optional post processing of jobs, to do this add `final` function to the handler with the following interface:

> NOTE: post processing apply after job status was sent to beanstalkd

**async final(status, delay, result)**
- **status:** job status (`success`, `release` or `bury`)
- **delay:** job delay in seconds for `release` or `null`
- **result:** a value returned/thowrn from `handler`

## BSW Consumer class

BSW Consumer class is used to connect to beanstalkd server and subscribe to a tube

The Consumer constructor takes configuration object:
- **host:** beanstalkd host (default: `'127.0.0.1'`)
- **port:** beanstalkd port (default: `11300`)
- **tube:** beanstalkd tube (default: `'default'`)
- **enable_logging:** enable logging to console (default value `false`)
- **reserve_timeout:** timeout value(in seconds) of job reservation (default value `30`)
- **max_processing_jobs:** max number of simultaneous jobs reserved (default: `1`)
- **auto_reconnect:** flag for reconnection behavior when connection is accidentally closed, which means it's not closed by client side and fivebeans will fire a `close` event (default value `false`)
- **handler:** handler async function (mandatory, MUST be an async function)
- **final:** final async function (optional, MUST be an async function)

### `async start()` function
Start the worker.
* NOTE async function can be called directly, or called inside another async function with `await` key word.
* If call `consumer.start()` directly, it will return immediately and process the actual start action asynchonously
* If call `await consumer.start()` inside an async function, it will wait until the start process finishes and then process the code at the back

Example:
```javascript
const consumer = new Consumer({
	host: '127.0.0.1',
	port: 27017,
	tube: 'example',
	handler: async function (payload, job_info) {
		console.log('processing job: ', payload);
		return 'success';
	}
});

// could be called directly without await
consumer.start();
// this line will be immediately called because start() is async function
console.log('do something');

// or could be called inside async function context
(async () => {
	await consumer.start();
	// this line will be called after start() returns
	console.log('do something');
})();
```

### `stop()` function
Stop the consumer immediately, and any processing jobs won't report to beanstalk.
Example
```javascript
consumer.stop();
```

### `async stopGracefully(timeout)` function
Stop the consumer in a more graceful way. Will wait until all the processing jobs are done and reported to beanstalk, or wait for a user-specific timeout value.

Example
```javascript
// stop the consumer gracefully within 3s
await consumer.stopGracefully(3000);
```

## BSW Producer class

BSW Producer class is used to connect to beanstalkd server and put jobs to a tube

The Producer constructor takes configuration object:
- **host:** beanstalkd host (default: `'127.0.0.1'`)
- **port:** beanstalkd port (default: `11300`)
- **tube:** beanstalkd tube (default: `'default'`)
- **enable_logging:** enable logging to console (default value `false`)

### `async start()` function
Same as Consumer class.

### `stop()` function
Same as Consumer class.

### `async putJob(job)` function
Put jobs to the tube. Receives an `job` object which has the following attributes:
- **payload:** job payload, type is String
- **priority:** job priority, 0 is highest, type is Integer
- **delay:** time(in seconds) for a job to transfer from Delayed state to Ready state, type is Integer
- **ttr:** time(in seconds) for a reserved job to become Ready state, type is Integer

Example:
```javascript
await producer.putJob({
	payload: JSON.stringify({key: 'value'}),
	priority: 0,
	delay: 0,
	ttr: 60
});
```

## Full example

Find the full example in `example` directory:

To run, clone the project, then:
```
> npm install
(If you have `yarn` installed in your machine, we recommand you use `yarn install` instead)
> cd example
> node producer.js
> node consumer.js
```

## Contributors
- Fedor Korshunov (for v1) - [view contributions](https://github.com/aftership/bsw/commits?author=fedor)
- Vence Lin (for v2) - [view contributions](https://github.com/aftership/bsw/commits?author=vence722)
