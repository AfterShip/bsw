BSW is a Node.js framework for beanstalkd workers

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Requiremens](#requiremens)
- [Quick Start](#quick-start)
- [Handler Class](#handler-class)
  - [Jobs processing](#jobs-processing)
  - [Post processing](#post-processing)
- [bsw worker class](#bsw-worker-class)
  - [Full example](#full-example)
- [Contributors](#contributors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Requiremens

Node.js v4 or above is required.

## Quick Start

```javascript
var Worker = require('bsw');

class Handler {
	* run(payload, job_info) {
		console.log('Hello world!');
	}
}

var worker = new Worker({tube: 'example', handler: Handler});
worker.start();
```

## Handler Class

Handler must be an [ES6 class](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Classes).

> NOTE: **handler class is not a singletone!**
>
> A new instance of handler class would be created for each job

To process jobs each handler **must** provide either:
- a `run` function that returns a `Promise` object
- or a `run` generator function for [co](https://github.com/tj/co) runner

`run` interface:

**run (payload, job_info)**
- **payload:** beanstalk job payload string or object (if job is a valid JSON)
- **job_info:** job details
- **job_info.id:** job id
- **job_info.tube:** job tube

`run` definition examples:

- Directly defined Promise
```javascript
class Handler {
	run(payload, job_info) {
		return new Promise(function(resolve, reject) {
			console.log('Hello world!');
			resolve();
		});
	}
}
```

- Promise returned by [co](https://github.com/tj/co)
```javascript
var co = require('co');
class Handler {
	run(payload, job_info) {
		return co(function() {
			console.log('Hello world!');
		});
	}
}
```

- Generator function
```javascript
class Handler {
	* run(payload, job_info) {
		console.log('Hello world!');
	}
}
```

### Jobs processing

After job reservation, `run` would be called. Each job must get one of the following status after processing:
- **success:** job processed succesfully and must be deleted from beanstalkd
- **bury:** job processing failed, it must be marked as buried in beanstalkd
- **release + delay:** job must be reserved again after delay

To report the job status, it must be returned/resolved or thrown/rejected from run function:
```javascript
// delete job
return 'success';
throw 'success';
resolve('success');
reject('success');

// bury job
return 'bury';
throw 'bury';
resolve('bury');
reject('bury');

// reput job without delay
return 'release';
throw 'release';
resolve('release');
reject('release');

// reput job with 10s delay
return ['release', 10];
throw ['release', 10];
resolve(['release', 10]);
reject(['release', 10]);
```

Default statuses:
- **success** if `run` returned/resolved with not known keyword
- **bury** if `run` thrown/rejected with not known keyword

For example:
```javascript
class Handler {
	* run(payload, job_info) {
		try {
			yield mayThrow();
		} catch (e) {
			return 'bury'
		}

		return 'success';
	}
}
```
equals to
```javascript
class Handler {
	* run(payload, job_info) {
		yield mayThrow();
	}
}
```

### Post processing
You may add an optional post processing of jobs, to do this add `final` function to the handler with the following interface:

> NOTE: post processing apply after job status was sent to beanstalkd

**final (status, delay, result)**
- **status:** job status (`success`, `release` or `bury`)
- **delay:** job delay in seconds for `release` or `null`
- **result:** a value returned/thworn (resolved/rejected) from `run`

## bsw worker class

BSW worker class is used to connect to beanstalkd server and subscribe to a tube

BSW constructor takes configuration object:
- **handler:** handler class or path to handler
- **host:** beanstalkd host (default: `'127.0.0.1'`)
- **port:** beanstalkd port (default: `11300`)
- **tube:** beanstalkd tube (default: `'default'`)
- **max:** Max number of simultaneous jobs reserved (default: `1`)
- **log:** Enable jobs logging (default: `true`)

`start()` function would start the worker.

Example:
```javascript
var Worker = require('bsw');
var worker = new Worker({
	tube: 'example',
	handler: __direname + '/handler' // or require(__direname + '/handler')
});
worker.start();
```

### Full example

Find the full example in `example` directory:

- **config.json:** defines beanstalkd connection and a tube name for both producer and consumer
- **producer.js:** use `fivebeans` beanstalkd client to put jobs to the queue (make sure to install `fivebeans` first: `npm install fivebeans`)
- **consumer_handler.js:** handler class for BSW worker
- **consumer.js:** BSW worker class usage

To run, copy the project, then:
```
> npm install
> cd example
> node producer.js
> CTRL+C
> node consumer.js
```

## Contributors
- Fedor Korshunov - [view contributions](https://github.com/aftership/bsw/commits?author=fedor)
