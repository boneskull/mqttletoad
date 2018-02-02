# mqttletoad

![mqttload logo](https://cldup.com/n0IMRXCXZz.png)

[![Coveralls](https://img.shields.io/coveralls/boneskull/mqttletoad.svg?style=flat-square)](https://coveralls.io/github/boneskull/mqttletoad) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release) [![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Black magic on top of MQTT.js

Provides MQTT topic listeners with wildcards!

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
2.  Received messages are all `Buffer` objects, and you can only publish a `Buffer` or `string`.
3. (BONUS ISSUE) It doesn't use `Promise`s, which some people prefer over callbacks.

`mqttletoad` solves the above problems.  These are problems I have, and likely many others have as well.

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

### Encoding and Decoding

MQTT makes no prescriptions about what a message looks like.  It's just a [blob](https://en.wikipedia.org/wiki/Binary_large_object).

But as a developer, you know your data.  Maybe that message is JSON, maybe it's base64-encoded, or maybe it's just a string.  You are unlikely to be surprised about what you get. 

Out-of-the-box, `mqttletoad` provides several common *decoders* for received messages, and *encoders* for publishing messages.

These are:

- `json` - Convert to/from a JSON representation of an object
- `text` - Convert to/from a UTF-8 encoded string
- `binary` - Convert to a `Buffer` (all received messages are `Buffer`s, so no decoding necessary)
- `base64` - Convert to/from a base64 (string) representation of just about anything

To use these, you can specify a *default* encoder and/or decoder when connecting:

```js
const toad = require('mqttletoad');

(async function () {
  const client = await toad.connect('wss://test.mosquitto.org', {
    encoder: 'json',
    decoder: 'json'
  });
  
  await client.subscribe('foo/bar', message => {
    console.log(message.baz); // quux
  });
  
  // see listener above
  await client.publish('foo/bar', {baz: 'quux'});  
}());
```

Or you can do this on a per-subscription/publish basis:

```js
const toad = require('mqttletoad');

(async function () {
  // "text" is the default encoder/decoder
  const client = await toad.connect('wss://test.mosquitto.org', {
    encoder: 'text',
    decoder: 'text'
  });
  
  await client.subscribe('foo/bar', message => {
    console.log(message.baz); // quux
  }, {decoder: 'json'});
  
  // see listener above
  await client.publish('foo/bar', {baz: 'quux'}, {encoder: 'json'});   
}());
```

You can also provide your own either way:

```js
const toad = require('mqttletoad');

(async function() {
  const client = await toad.connect('wss://test.mosquitto.org', {
    decoder: parseFloat 
  });
  
  await client.subscribe('foo/bar', message => {
    console.log(message); // 123.4
  });
  
  await client.subscribe('foo/bar', message => {
    console.log(message); // '123.4'
  }, {decoder: 'text'});
  
  // see listeners above
  await client.publish('foo/bar', 123.4); // default encoder is "text"  
}());
```

### Promise Support

[async-mqtt](https://npm.im/async-mqtt) does the same thing here--more or less.

The following functions are promisified:

- `MqttClient#publish`
- `MqttClient#subscribe`
- `MqttClient#unsubscribe`
- `MqttClient#end`

### IPC Support

`mqttletoad` supports connecting to an MQTT broker running on a named pipe.

## Install

**Node.js v7.0.0 or greater required**.

```bash
$ npm install mqttletoad
```

## Usage

This is a fancypants wrapper around [MQTT.js](https://npm.im/mqtt), so most everything there applies here, except the differences noted above. 

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
  
  // uses default "text" decoder
  const suback = await client.subscribe('winken/+/nod', (str, packet) => {
    console.log(`topic: "${packet.topic}", message: "${str}"`);
  }, {qos: 1});
  
  console.log(`subscribed to ${suback.topic} w/ QoS ${suback.qos}`);
  
  // uses default "text" encoder
  await client.publish('winken/blinken/nod', 'foo');
  
  const someOtherListener = (message, packet) => {
    // does stuff with MESSAGE
  };
  
  // a custom decoder
  await client.subscribe('winken/+/nod', someOtherListener, {
    decoder: value => String(value).toUpperCase()
  });
  
  // remove only this particular listener for this topic;
  // no actual unsubscription occurs because this isn't the only listener
  // on the topic.
  await client.unsubscribe('winken/+/nod', someOtherListener);
  
  // remove ALL listeners from this topic and unsubscribe
  await client.unsubscribe('winken/+/nod');
  
  // disconnect
  await client.end();

  // IPC support (mqtt only; not ws)
  const client = await toad.connect({path: '/path/to/my/named/pipe'});
}
```

- Use `client.subscribe(topic, [opts], listener)` to *register a listener* for the topic. 
  - `opts` are the standard options `MqttClient#subscribe()` supports, including `decoder`
  - While `MqttClient#subscribe()` supports an `Array` of topics, our `topic` is singular, and *must* be a string.
  - Standard MQTT topic wildcards are supported, and listeners are executed first in order of specificity; i.e. `foo/bar` will take precedence over `foo/+` and `foo/+` will take precedence over `foo/#`.
- Use `client.unsubscribe(topic, listener)` to remove the listener for the topic.
  - This will not necessarily *unsubscribe* from the topic (at the broker level), because there may be other listeners, but it *will* remove the listener.
  - If `listener` is omitted, all listeners are removed, which forces unsubscription.
- Use `client.end(force=false)` to disconnect 
- Use `client.publish(topic, message, [opts])` with standard `MqttClient#publish()` options, including `encoder`
- Use `connect(url, [opts])` to connect; `url` is a `string`, or you could just pass an `opts` object.  Includes `encoder` and `decoder` options, which set the default encoder and decoder, respectively.  The default is `text` in both cases.

## Roadmap

- [ ] Something something Rollup?
 
## Maintainers

[@boneskull](https://github.com/boneskull)

## Contribute

Is this module useful for you?  Please let me know.  PRs accepted!

## License

Apache-2.0 © 2017 Christopher Hiller
