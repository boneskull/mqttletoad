'use strict';

const MQTT = require('mqtt');
const pify = require('pify');
const {EventEmitter2} = require('eventemitter2');

const eventify = topic => topic.replace(/#/g, '**')
  .replace(/\+/g, '*');
const mqttify = event => event.replace(/\*\*/g, '#')
  .replace(/\*/g, '+');

/**
 * If the topic/event is not internal, then trigger a MQTT subscription.
 * @param {Set} clientEvents - Set of events to ignore
 * @param {string} methodName - Method name to monkeypatch (`on` or `once`)
 */
const eventProxy = (clientEvents, methodName) => (target,
  client,
  [topic, ...args]
) => {
  // let original events pass thru
  if (clientEvents.has(topic)) {
    return target.apply(client, [topic, ...args]);
  }
  let [opts, listener] = args;
  if (typeof opts === 'function') {
    listener = opts;
    opts = {};
  }
  if (!listener) {
    throw new TypeError('Invalid parameters');
  }
  const ee2Topic = eventify(topic);
  client._topicEmitter[methodName](ee2Topic, listener);

  // TODO: find a way to not subscribe to already-subscribed topics
  // (note that options such as QoS may differ, and in that case, we need to
  // re-subscribe)
  client.subscribe(topic, opts)
    .catch(err => {
      client._topicEmitter.removeListener(ee2Topic, listener);
      client.emit('error', err);
    })
    .then(suback => {
      client.emit('suback', suback);
    });

  return client;
};

const unsub = (client, topic) => {
  return client.unsubscribe(topic)
    .then(() => {
      client.emit('unsuback', {topic});
    })
    .catch(err => {
      client.emit('error', err);
    });
};

/*
 */

/**
 * Monkeypatches a `MqttClient` instance.
 * Promisifies `end`, `subscribe`, `publish`, and `unsubscribe`.
 * Adds special behavior around `on`, `once`, `removeListener`, `emit`, etc.
 * @param {MqttClient} client - MqttClient (does not mutate)
 * @returns {MqttClient} Patched client
 */
const toadpatch = client => {
  client = pify(client, {
    include: ['end', 'subscribe', 'publish', 'unsubscribe']
  });

  /**
   * Events that MqttClient actually uses internally
   * @type {Set}
   */
  const clientEvents = new Set(client.eventNames()
    .concat(['suback',
      'unsuback',
      'packetsend',
      'packetreceive',
      'message',
      'offline',
      'close',
      'reconnect']));

  /**
   * Adapter between MQTT topics (supporting wildcards) and the client events.
   * @type {EventEmitter2}
   * @private
   */
  client._topicEmitter = new EventEmitter2({
    wildcard: true,
    delimiter: '/'
  }).on('removeListener', event => {
    // if we're removing a listener for any reason, check to see if an
    // "unsubscribe" needs to happen (and do it)
    if (!client._topicEmitter.listenerCount(event)) {
      unsub(client, mqttify(event));
    }
  });

  /**
   * This will subscribe to MQTT topics if the topic/event is *not* an internal
   * `MqttClient` or `mqttletoad` event.  `EventEmitter#on`
   * @public
   * @param {string} topic - MQTT topic (or event)
   * @param {Buffer|string|ArrayBuffer|*} [message] - Event data or MQTT
   *   message.  If the latter, must be one of `Buffer`, `string`, or
   *   `ArrayBuffer`.
   * @param {Object} [opts] - Any options for MQTT subscription (like `qos`),
   *   or more data for event
   * @param {*} [...args] - More data for event
   * @returns {MqttClient}
   */
  client.on = new Proxy(client.on, {
    apply: eventProxy(clientEvents, 'on')
  });

  /**
   * This will subscribe to MQTT topics if the topic/event is *not* an internal
   * `MqttClient` or `mqttletoad` event.  Works like `EventEmitter#once`
   * @public
   * @param {string} topic - MQTT topic (or event)
   * @param {Buffer|string|ArrayBuffer|*} [message] - Event data or MQTT
   *   message.  If the latter, must be one of `Buffer`, `string`, or
   *   `ArrayBuffer`.
   * @param {Object} [opts] - Any options for MQTT subscription (like `qos`),
   *   or more data for event
   * @param {*} [...args] - More data for event
   * @returns {MqttClient}
   */
  client.once = new Proxy(client.once, {
    apply: eventProxy(clientEvents, 'once')
  });

  /**
   * If the topic/event is *not* internal, remove it from the internal EE2
   * instance, which may cause an unsubscribe to happen.  Works like
   * `EventEmitter#removeListener`.
   * @public
   * @param {string} topic - MQTT topic (or event)
   * @param {Function} listener - Listener function to remove
   * @returns {MqttClient}
   */
  client.removeListener = new Proxy(client.removeListener, {
    apply (target, client, [topic, listener]) {
      // let original events pass thru
      if (clientEvents.has(topic)) {
        return target.apply(client, [topic, listener]);
      }
      // remove it from internal EE2; if none remain for the topic, it
      // will be unsubscribed from.
      client._topicEmitter.removeListener(eventify(topic), listener);
      return client;
    }
  });

  /**
   * Publishes a MQTT message if *not* an internal event.
   * This breaks the contract where `emit` should return the number of
   * listeners. We don't know the number of listeners, and the publishing
   * process is async anyway (though, arguably, not with QoS 0, but...zalgo).
   * @public
   * @param {string} topic - MQTT topic (or event)
   * @param {Buffer|string|ArrayBuffer} [message] - Message if MQTT; otherwise
   *   optional if internal
   * @param {Object} [opts] - MQTT options or more data for internal event
   * @param {*} [...args] - More data for internal event (ignored by MQTT)
   * @returns {Promise<string>|number} Topic, once publish happens (depends on
   *   QoS), or just the number of listeners if internal (yes, this is bad)
   */
  client.emit = new Proxy(client.emit, {
    apply (target, client, [topic, ...args]) {
      // let original events pass thru
      if (clientEvents.has(topic)) {
        return target.apply(client, [topic, ...args]);
      }
      const [message, opts] = args;
      return client.publish(topic, message, opts)
        .then(() => topic);
    }
  });

  /**
   * On any received message, delegate to the internal EE2 instance
   * where the real listeners for subscriptions are stored.
   */
  client.on('message', (topic, message, packet) => {
    client._topicEmitter.emit(eventify(topic), message, packet);
  });

  return client;
};

/**
 * Accepts same parameters as `mqtt.connect`, except returns a `Promise`
 * which is fulfilled when the connection is made.
 * Returns a fancypants patched `MqttClient` instance.
 * @see https://www.npmjs.com/package/mqtt#connect
 * @returns {Promise<MqttClient>} Patched `MqttClient` instance
 */
exports.connect = (...args) => {
  const client = MQTT.connect(...args);
  return new Promise((resolve, reject) => {
    client.on('error', reject)
      .on('connect', () => {
        resolve(toadpatch(client));
      });
  });
};

exports.patch = toadpatch;
exports.Store = MQTT.Store;
