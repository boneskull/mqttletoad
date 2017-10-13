# mqttletoad

![mqttload logo](https://cldup.com/n0IMRXCXZz.png)

[![Coveralls](https://img.shields.io/coveralls/boneskull/mqttletoad.svg?style=flat-square)](https://coveralls.io/github/boneskull/mqttletoad) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release) [![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Black magic on top of MQTT.js

Provides MQTT topic subscription [`EventEmitter`](https://nodejs.org/api/events.html#events_class_eventemitter)-style (with wildcards!).

Also, `Promise`s.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Roadmap](#roadmap)
- [Maintainers](#maintainers)
- [Contribute](#contribute)
- [License](#license)

## Background

> This is my MQTT.js wrapper.  There are many like it, but this one is mine.

[MQTT.js](https://npm.im/mqtt) is an excellent [MQTT](https://en.wikipedia.org/wiki/MQTT) client for Node.js & the browser.  It is somewhat of a low-level module, however.

There are two (2) main issues which users of MQTT.js will quickly encounter:

1.  You can't just set a listener function for a subscribed topic; you have to stuff logic into a listener on the `message` event, and figure out what to do with the topic.
2.  Received messages are all `Buffer`s, and when publishing, your message must be a `string`, `Buffer`, or `ArrayBuffer`.
3. (BONUS ISSUE) It doesn't use `Promise`s, which some people prefer over callbacks.

`mqttletoad` solves the *first* problem and the *third* problem.

### Listeners for Specific Topics

When subscribing to an MQTT topic, you can use wildcards (`+` and `#`).  If you do, then you have to *match* an incoming message's topic.  Say we subscribed to:

```
foo/+/baz
```

with a listener function `quux()`.  And an we receive a message with topic:

```
foo/bar/baz
```

How do we know to execute `quux()`?

We need something like a *router* (think [express](https://www.npmjs.com/package/express)) to be able to match the topic to the proper listener.

[EventEmitter2](https://npm.im/eventemitter2) does exactly this by supporting wildcards in event names.  It's flexible, so you *don't* need to use Express-style routes (`foo/:param/baz`), which is what several other libraries tackling the same problem have done.

What's better is that `EventEmitter`s are standardized.  They are easy to consume.  Think [RxJs](https://npm.im/rxjs)'s `Observable.fromEvent()`.  This should help those using a "reactive" programming model.

### Promise Support

[async-mqtt](https://npm.im/async-mqtt) does the same thing here--more or less.

### WONTFIX: Message Formats

MQTT makes no prescriptions about what your message looks like.  It's just a [blob](https://en.wikipedia.org/wiki/Binary_large_object).  A JavaScript object is neither of these!  If you need to publish an object, call `JSON.stringify` on it first:

```js
const obj = {goin: 'on'};
client.emit('fever/flavor', JSON.stringify(obj));
```

When subscribing, you will *always* receive a `Buffer`.  You'll need to unwrap it yourself:

```js
client.on('a/licky/boom/boom/down', buf => {
  const obj = JSON.stringify(String(buf));
});
``` 

A better idea may be to put some metadata in your topic about the message format, but again, this is up to you:

```js
const formatters = {
  json: val => String(JSON.stringify),
  text: String,
  yaml: parseYaml
};

client.on('radscript/4ever/format/+', (buf, {topic})=> {
  const format = topic.split('/').pop();
  const result = formatters[format](buf);
});
```

## Install

**Node.js v7.0.0 or greater required**.

```bash
$ npm install mqttletoad
```

## Usage

```js
const toad = require('mqttletoad');

const myfunc = async () => {
  const client = await toad.connect('wss://test.mosquitto.org');
  
  client.on('disconnect', () => {
    console.warn('client disconnected');
  })
  .on('offline', () => {
    console.warn('client offline; reconnecting...');
  });
  
  // yes, `buf` is still a Buffer.
  const suback = await client.subscribe('winken/+/nod', (buf, packet) => {
    console.log(`topic: "${packet.topic}", message: "${String(buf)}"`);
  }, {qos: 1});
  
  console.log(`subscribed to ${suback.topic} w/ QoS ${suback.qos}`);
  
  await client.publish('winken/blinken/nod', 'foo');
}
```

## API

Basically it's [async-mqtt](https://npm.im/async-mqtt) (which is [mqtt](https://npm.im/mqtt)) except:

- Use `client.subscribe(topic, [opts], listener)` to *register a listener* for the topic. 
  - `opts` are the standard options `mqtt.Client#subscribe()` supports
  - While `mqtt.Client#subscribe()` supports an `Array` of topics, our `topic` is singular, and must be a string.
  - Standard MQTT topic wildcards are supported, and listeners are executed first in order of specificity; i.e. `foo/bar` will take precedence over `foo/+` and `foo/+` will take precedence over `foo/#`.
- Use `client.unsubscribe(topic, listener)` to remove the listener for the topic.
  - This will not necessarily *unsubscribe* from the topic (at the broker level), because there may be other listeners, but it *will* remove the listener.
- `client.end()` won't throw a fit if already disconnected

## Roadmap

- [ ] Something something Rollup?
 
## Maintainers

[@boneskull](https://github.com/boneskull)

## Contribute

Is this module useful for you?  Please let me know.  PRs accepted!

## License

Apache-2.0 © 2017 Christopher Hiller
